# The Doctors – Elizabeth Medical Centre

A "coming soon" holding page for The Doctors – Elizabeth Medical Centre, a new medical centre in Kuta, Lombok. It follows the brand guidelines from Daniela Design Studio.

It's a static site with no build step. To preview it, open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000
```

## Structure

```
index.html              Page (the logos are inlined as an SVG sprite)
favicon.svg             Brandmark app icon (Medical Teal)
apple-touch-icon.png
assets/css/styles.css   Brand tokens and layout
assets/js/main.js       Notify-me form handling
assets/logo/            Vector logos extracted from the brand PDF
assets/img/             Interior renders and the topographic line pattern
```

## Brand

| Colour             | Hex       |
| ------------------ | --------- |
| Vitality Clay      | `#a35038` |
| Clinical Off-White | `#e3ceb1` |
| Medical Teal       | `#466c67` |
| Healing Sage       | `#9aa585` |
| Pulse Red          | `#662b1d` |

The brand typefaces (TD Arial and Elizabeth Sans, plus Marlide Display for editorial text) aren't available as webfonts. For now the page uses these Google Fonts instead:

| Brand typeface                | Stand-in                  |
| ----------------------------- | ------------------------- |
| TD Arial (headline)           | Nunito                    |
| Elizabeth Sans (body)         | Archivo, expanded width   |
| Montserrat (labels)           | Montserrat                |
| Marlide Display (editorial)   | Instrument Serif          |

To switch to the licensed fonts, add the `@font-face` rules and update the `--font-*` variables at the top of `assets/css/styles.css`.

## To do before launch

- **Connect the sign-up form.** Create a form on [Formspree](https://formspree.io), or any endpoint that accepts a form POST and returns JSON. Then replace `YOUR_FORM_ID` in the form's `action` in `index.html`. Until you do this, the form tells visitors that sign-ups aren't connected yet, and no data is sent anywhere.
- Add contact details (phone, email, WhatsApp) and an opening date once they're confirmed.
- Use an absolute URL for `og:image` once the domain is live.
