// Opening-notification sign-up.
// The form posts to a Formspree-compatible endpoint set in index.html (form[action]).
// Until a real endpoint is configured, submissions are not sent anywhere.
(function () {
  var year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();

  var form = document.querySelector("[data-notify]");
  if (!form) return;

  var status = form.querySelector(".notify__status");
  var button = form.querySelector("button");
  var isConfigured = form.action.indexOf("YOUR_FORM_ID") === -1;

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (!isConfigured) {
      status.textContent = "Sign-ups aren’t connected yet — please check back soon.";
      return;
    }

    button.disabled = true;
    status.textContent = "Sending…";

    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error(response.statusText);
        form.reset();
        status.textContent = "Thank you — we’ll let you know when we open.";
      })
      .catch(function () {
        status.textContent = "Something went wrong. Please try again.";
      })
      .finally(function () {
        button.disabled = false;
      });
  });
})();
