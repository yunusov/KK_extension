const ID = "AKfycbzMlBJNo_mu2RHGkJo9lDKXuPNFfZjLxTJdt1va0yeAjkNPMovf7BY_gd4EmHyJZB8";


fetch(`https://script.google.com/macros/s/${ID}/exec`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    secret: 'my-token',
    values: [
      ['OK', new Date().toISOString(), 'hello from console']
    ]
  })
}).then(r => r.json()).then(console.log);
