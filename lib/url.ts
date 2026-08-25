/**
 * A query string every server will accept.
 *
 * Axios builds one of its own, and its serializer deliberately leaves some
 * reserved characters as they are - a comma, a colon, a plus. Jellyseerr
 * validates its query parameters strictly and answers a title containing any
 * of them with 400 "Parameter 'query' must be url encoded", which reached the
 * app as a search that returned nothing for certain films.
 *
 * Everything is encoded here, keys included, and empty values are dropped
 * rather than sent as `key=`.
 */
export function queryString(params: Record<string, string | number | null | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}
