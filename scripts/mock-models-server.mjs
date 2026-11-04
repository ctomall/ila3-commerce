import http from 'node:http'
http.createServer((req, res) => {
  if (req.url === '/v1/models') {
    if (req.headers.authorization !== 'Bearer mock-key-123') {
      res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"bad key"}'); return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'mock-chat', name: 'Mock Chat' }, { id: 'mock-reasoner', name: 'Mock Reasoner' }] }))
    return
  }
  res.writeHead(404); res.end('{}')
}).listen(18080, '127.0.0.1', () => console.log('mock models on 18080'))
