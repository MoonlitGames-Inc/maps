# PulseNav Drive

A single-folder, static, GitHub Pages-ready maps app with a Waze-like mobile UI.

## Files

Everything is in this one folder. There are no nested folders.

- `index.html` — app shell
- `styles.css` — mobile navigation UI
- `app.js` — map, search, route, GPS, tilted camera, and TTS logic
- `manifest.webmanifest` — installable PWA metadata
- `sw.js` — tiny local-asset service worker
- `icon.svg` — app icon

## What changed in this version

- Added an **Offline kit**: saved place search, seeded offline landmarks, cached search results, and cached routes for routes already calculated online.
- Added an offline status pill under the search bar so you can see how many places/routes are saved.
- Added service-worker runtime caching for the app shell, MapLibre files, and already-viewed OpenFreeMap resources.
- Switched from Leaflet/raster tiles to **MapLibre GL JS** with **OpenFreeMap vector tiles**.
- Added a real pitched/tilted camera using MapLibre pitch and bearing.
- Added a vehicle-style live-location marker.
- Added Waze-style follow camera that sits behind the vehicle during navigation.
- Added text-to-speech voice guidance using the browser Web Speech API.
- Added turn-by-turn route cards from OSRM route steps.
- Added a cleaner, less generic UI with floating navigation panels.
- Added map style switching between OpenFreeMap Liberty, Bright, and Positron.
- Added a demo drive mode for testing without moving.

## How to run locally

Because browsers restrict location and service workers on plain file URLs, run it from a local server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## How to put on GitHub Pages

1. Create a new GitHub repository.
2. Upload all files from this folder directly into the repo root.
3. Go to **Settings → Pages**.
4. Set source to **Deploy from a branch**.
5. Choose `main` and `/root`.
6. Open the Pages URL once it deploys.

## Notes

- The app is static and needs no backend.
- GPS works best on HTTPS, which GitHub Pages provides.
- Voice guidance requires the user to tap the voice button first because browsers block autoplay speech.
- OSRM public routing is a demo service, so heavy production traffic should use your own routing backend.
- Nominatim search is public and should be used politely. The app debounces search requests.

## Mobile UI Mode

Tap the **Mobile UI** switch in the top bar to turn on the compact mobile layout. The setting is saved in the browser with `localStorage`, so GitHub Pages will remember it on the same device. Compact mode tightens the search bar, route sheet, turn banner, GPS button, HUD, and suggestion list so the map stays easier to see on smaller screens.

## Auto-rerouting

When navigation is active, PulseNav checks your live GPS position against the route line. If you stay clearly off-route for several seconds, it requests a fresh OSRM route from your current position to the same destination. It also includes a cooldown so one noisy GPS jump does not spam reroute requests.


## Offline search and routing

PulseNav now supports the most realistic offline setup possible for a static GitHub Pages app:

- **Offline place search works** for built-in places and any places you searched or selected while online.
- **Cached route loading works** when you previously calculated a route online from roughly the same starting area to the same destination.
- **Full new offline route calculation is not included** because real offline driving routes require a large road graph database and routing engine. That is too large for a one-folder static GitHub Pages project.
- Map tiles/styles can load offline only for areas/resources the browser has already cached.

To test it:
1. Open the app online.
2. Search/select a few places.
3. Calculate a route.
4. Turn off your internet.
5. Reload the app and use **Offline kit** or search for the saved place.
