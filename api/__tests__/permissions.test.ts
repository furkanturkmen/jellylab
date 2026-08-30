import { canManageRequests, PERMISSION } from '../jellyseerr';

const user = (permissions: number) => ({ id: 1, displayName: 'x', permissions });

describe('canManageRequests', () => {
  // The real values from this server, so the test fails if the bits ever move.
  it('lets an administrator through', () => {
    expect(canManageRequests(user(PERMISSION.ADMIN))).toBe(true);
  });

  it('keeps ordinary accounts out', () => {
    // 160 = REQUEST | AUTO_APPROVE, which is what every guest account has.
    // They may ask for things; they may not overturn a decision about them.
    expect(canManageRequests(user(160))).toBe(false);
    expect(canManageRequests(user(0))).toBe(false);
  });

  it('accepts the specific permission as well as admin', () => {
    expect(canManageRequests(user(PERMISSION.MANAGE_REQUESTS))).toBe(true);
    // Held alongside others.
    expect(canManageRequests(user(PERMISSION.MANAGE_REQUESTS | 160))).toBe(true);
  });

  it('refuses when it cannot tell', () => {
    // currentUser returns null on any failure, and a screen that cannot
    // determine permissions must offer the fewest actions rather than assume.
    expect(canManageRequests(null)).toBe(false);
  });
});
