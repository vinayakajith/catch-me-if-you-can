function handler(event) {
  var request = event.request;
  if (request.uri === '/' || request.uri === '/create' || /^\/r\/[a-f0-9-]{36}\/?$/.test(request.uri)) request.uri = '/index.html';
  return request;
}
