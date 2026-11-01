# RefurbVision

A web app for people renovating old wooden furniture. Upload a photo of a wooden unit and preview how it could look:

- **Sanded & Varnished** – scuffs and blotches smoothed out, grain revived, with a choice of stains (clear, light oak, honey, teak, walnut, mahogany, ebony, grey wash) and matt / satin / gloss finish.
- **Painted** – 11 furniture-paint colours plus a custom colour picker, with finish and "grain showing through" controls.
- **AI Suggest** – looks at the photo's tone, colour and wear and suggests a complete look (finish + hardware) with a short designer note. Tap again for another idea.
- **Handles & Knobs** – tap on each old handle to swap it for round/square/T-bar knobs, bar, cup or ring pulls, leather straps, or go handleless, in 8 finishes. The old handle is covered over. Only the hardware changes, so it works with any finish (or the original wood).
- Before/after slider, "fix which part is the furniture" brush, and save the preview as an image.

Everything runs in the browser – photos are never uploaded anywhere.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Live at https://gazcart.github.io/Celebration-Cruise-/ (served from the `gh-pages` branch).

The "AI Suggest" button uses a built-in, on-device design engine (photo analysis + curated style rules), so it needs no API key or internet connection.
