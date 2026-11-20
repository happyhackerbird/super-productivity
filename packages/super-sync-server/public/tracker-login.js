// Sign-in for /tracker/: trades a capture token for the session cookie.
(function () {
  var form = document.getElementById('login');
  var input = document.getElementById('token');
  var msg = document.getElementById('msg');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    msg.textContent = '';
    fetch('/api/tracker/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tracker-Request': '1' },
      credentials: 'same-origin',
      body: JSON.stringify({ token: input.value }),
    })
      .then(function (res) {
        if (res.status === 204) location.reload();
        else if (res.status === 401) msg.textContent = 'Token not accepted.';
        else msg.textContent = 'Sign-in failed (' + res.status + ').';
      })
      .catch(function () {
        msg.textContent = 'Sign-in failed (network).';
      });
  });
})();
