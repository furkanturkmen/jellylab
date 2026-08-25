/**
 * Pin the timezone for the test run.
 *
 * `formatDate` renders a timestamp in local time, which is right on a phone and
 * makes assertions depend on where they run: a stamp at 23:00 UTC is one day in
 * Amsterdam and another on a CI runner set to UTC, and that is exactly how the
 * first CI run failed a suite that had always passed locally.
 */
module.exports = async () => {
  process.env.TZ = 'Europe/Amsterdam';
};
