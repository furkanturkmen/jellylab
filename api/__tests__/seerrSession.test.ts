/*
 * The Jellyseerr session plumbing, with the network and the secure store
 * replaced: axios.create hands back a client whose calls and interceptors the
 * test drives by hand. jest.mock is hoisted above the import, and the mocks
 * only read these variables when called.
 */
import { authClient, beginSignIn, loginJellyfin, sessionTag } from '../jellyseerr';

const mockPost = jest.fn();
const mockGet = jest.fn();
const mockRejected: ((e: any) => Promise<unknown>)[] = [];
let mockStored: any = null;

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      post: (...args: unknown[]) => mockPost(...args),
      get: (...args: unknown[]) => mockGet(...args),
      interceptors: {
        response: { use: (_ok: unknown, bad: (e: any) => Promise<unknown>) => { mockRejected.push(bad); } },
      },
    })),
  },
}));

jest.mock('@/config', () => ({
  requireJellyseerrUrl: async () => 'http://seerr.test',
  requireJellyfinUrl: async () => 'http://jellyfin.test',
}));

jest.mock('@/store/auth', () => ({
  loadJellyseerrAuth: jest.fn(async () => mockStored),
  saveJellyseerrAuth: jest.fn(async (auth: unknown) => { mockStored = auth; }),
  clearJellyseerrAuth: jest.fn(async () => { mockStored = null; }),
}));

/** The interceptor authClient added - the last one registered. */
const authInterceptor = () => mockRejected[mockRejected.length - 1];
const rejection = (status: number, cookie?: string) => ({
  response: { status },
  config: { headers: cookie ? { Cookie: cookie } : {} },
});

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
  mockRejected.length = 0;
  mockStored = null;
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  (console.log as jest.Mock).mockRestore();
});

describe('sessionTag', () => {
  it('gives the start of the session id, as Seerr stores it', () => {
    expect(sessionTag('connect.sid=s%3AvfoyZDZyQWERTY.signature')).toBe('vfoyZDZy');
    expect(sessionTag('connect.sid=s:urYinxrSabcdef.signature')).toBe('urYinxrS');
  });

  it('never includes the signature that makes the cookie a credential', () => {
    expect(sessionTag('connect.sid=s%3Aab.signature-part')).toBe('ab');
  });

  it('finds the session among other cookies', () => {
    expect(sessionTag('theme=dark; connect.sid=s%3AXZYGPsPs1234.sig')).toBe('XZYGPsPs');
  });

  it('says when there is no session cookie at all', () => {
    expect(sessionTag('')).toBe('none');
    expect(sessionTag(undefined)).toBe('none');
    expect(sessionTag('theme=dark')).toBe('other');
  });
});

describe('loginJellyfin', () => {
  // The case that started this: the phone gave up on the reply, and the retry
  // with a hostname turned a dropped connection into a hostname error.
  it('does not retry with a hostname when Seerr never answered', async () => {
    mockPost.mockRejectedValueOnce(Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' }));
    await expect(loginJellyfin('talha', 'pw')).rejects.toThrow('timeout');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the credentials were wrong', async () => {
    mockPost.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(loginJellyfin('talha', 'wrong')).rejects.toEqual({ response: { status: 401 } });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('retries with a hostname when Seerr answered with something else', async () => {
    mockPost
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({ headers: {}, data: { id: 4, email: 'talha' } });
    mockGet.mockResolvedValueOnce({ data: { id: 4 } });

    await expect(loginJellyfin('talha', 'pw')).resolves.toMatchObject({ userId: 4 });
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[1][1]).toMatchObject({ hostname: 'http://jellyfin.test' });
  });
});

describe('authClient, when a reply outlives the session it was sent with', () => {
  const previous = { cookie: 'connect.sid=s%3AurYinxrS.sig', userId: 1, email: 'furkan' };
  const next = { cookie: 'connect.sid=s%3AvfoyZDZy.sig', userId: 4, email: 'talha' };

  it('leaves a newer sign-in alone when a stale 403 arrives late', async () => {
    mockStored = previous;
    await authClient();
    const late = authInterceptor();

    // The account switch happens while that call is still out.
    beginSignIn()();
    mockStored = next;

    await expect(late(rejection(403, previous.cookie))).rejects.toBeDefined();
    expect(mockStored).toEqual(next);
  });

  it('does not sign the new account out over a late 401', async () => {
    mockStored = previous;
    await authClient();
    const late = authInterceptor();

    beginSignIn()();
    mockStored = next;

    await expect(late(rejection(401))).rejects.toBeDefined();
    expect(mockStored).toEqual(next);
  });

  it('still drops a stale cookie of its own', async () => {
    mockStored = previous;
    await authClient();

    await expect(authInterceptor()(rejection(403, previous.cookie))).rejects.toBeDefined();
    expect(mockStored).toEqual({ ...previous, cookie: '' });
  });

  it('logs which session a rejected call carried', async () => {
    mockStored = next;
    await authClient();

    await expect(authInterceptor()(rejection(403, 'connect.sid=s%3AurYinxrS.sig'))).rejects.toBeDefined();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('seerr 403: header=urYinxrS stored=vfoyZDZy user=4'));
  });
});
