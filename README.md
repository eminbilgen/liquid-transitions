# liquid-transitions

WebGL image transitions in one dependency-free file. Three effects (liquid, ripple, dissolve), click or hover triggers, and a plain `<img>` fallback when WebGL is not available.

**Live demo:** [liquid.bilgen.dev](https://liquid.bilgen.dev)

```js
import { LiquidTransition } from './liquid-transitions.js';

const gallery = new LiquidTransition(document.querySelector('.hero'), {
  images: ['one.jpg', 'two.jpg', 'three.jpg'],
  effect: 'liquid',   // liquid | ripple | dissolve
  duration: 1.1,      // seconds
  intensity: 0.6,     // 0 to 2
  trigger: 'click',   // click | hover | manual
  alt: 'Project gallery',
});

gallery.next();
```

## Install

Copy `src/liquid-transitions.js` into your project. It is a standard ES module with no imports, so it works with a bundler or straight from a `<script type="module">`.

The container needs a size, for example a CSS `aspect-ratio` or a fixed height. The images are drawn like `object-fit: cover`.

## Options

| Option | Meaning | Default |
|---|---|---|
| `images` | Two or more image URLs. | required |
| `effect` | `liquid` flows both pictures through noise. `ripple` spreads a ring from the pointer. `dissolve` breaks the picture into grain. | `liquid` |
| `duration` | Transition length in seconds, 0.1 to 10. | `1.1` |
| `intensity` | Strength of the distortion, 0 to 2. | `0.6` |
| `trigger` | `click` goes to the next image on click. `hover` goes forward when the pointer enters and back when it leaves. `manual` leaves it to your code. | `click` |
| `alt` | Accessible label for the whole gallery. | `Image gallery` |
| `start` | Index of the first image. | `0` |

## Methods and events

```js
gallery.next();            // Promise, resolves with the new index
gallery.prev();
gallery.goTo(2);
gallery.setEffect('ripple');
gallery.setIntensity(1.2);
gallery.setDuration(0.8);
gallery.destroy();         // removes listeners, canvas and the WebGL context

el.addEventListener('liquid:change', (e) => console.log(e.detail.index));
```

Calling `goTo` while a transition is running starts a new one from where the picture was heading, so fast clicking never stalls or jumps.

## Behaviour worth knowing

- **Fallback.** A normal `<img>` sits under the canvas. It shows while images load and stays if WebGL cannot start, in which case `goTo` simply swaps the image.
- **Reduced motion.** With `prefers-reduced-motion`, changes are instant.
- **Rendering only when needed.** The animation loop runs during a transition and stops afterwards, so an idle gallery costs nothing. The canvas follows the container size through a `ResizeObserver`, with the pixel ratio capped at 2.
- **Same origin or CORS.** Textures are read through WebGL, so images from another domain must send CORS headers (the loader sets `crossOrigin="anonymous"`).
- **Context loss.** If the browser drops the WebGL context, the plain image is visible again.

## Limits

- WebGL 1, so it runs nearly everywhere, but there is no automatic downscaling of huge images. Keep each texture under about 4096 pixels on its longest side.
- The effects are procedural, with no displacement-map option yet.
- One canvas per container. Use a few galleries, not a hundred.

## Develop

```bash
npm test                      # unit tests for the pure helpers, no dependencies
python -m http.server 8000    # then open http://localhost:8000/demo/
```

## License

MIT, see [LICENSE](LICENSE).
