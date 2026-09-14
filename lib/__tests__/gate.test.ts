import { createGate } from '../gate';

/** Long enough for every settled promise to have run its callbacks. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('createGate', () => {
  it('lets callers straight through when nothing is under way', async () => {
    const gate = createGate();
    let passed = false;
    await gate.wait().then(() => { passed = true; });
    expect(passed).toBe(true);
  });

  // The case that started this: Discover and Requests asked for data while the
  // Seerr login was still running, and settled on "sign in to Jellyseerr".
  it('holds callers until it is opened again', async () => {
    const gate = createGate();
    const open = gate.close();
    let passed = false;
    const waiting = gate.wait().then(() => { passed = true; });

    await settle();
    expect(passed).toBe(false);

    open();
    await waiting;
    expect(passed).toBe(true);
  });

  it('keeps callers waiting through a sign-in that starts before the first ends', async () => {
    const gate = createGate();
    const openFirst = gate.close();
    let passed = false;
    const waiting = gate.wait().then(() => { passed = true; });

    const openSecond = gate.close();
    openFirst();
    await settle();
    expect(passed).toBe(false);

    openSecond();
    await waiting;
    expect(passed).toBe(true);
  });

  it('does not mind being opened twice', async () => {
    const gate = createGate();
    const open = gate.close();
    open();
    open();
    let passed = false;
    await gate.wait().then(() => { passed = true; });
    expect(passed).toBe(true);
  });
});
