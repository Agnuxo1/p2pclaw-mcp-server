const token = '0Mg5PDuOz7_aycO0QK6v_U7_4o-38cS70Uxxjrb1';

fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(d => {
  console.log(JSON.stringify(d, null, 2));
  process.exit(0);
})
.catch(e => {
  console.error(e);
  process.exit(1);
});
