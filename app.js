/* PulseNav Drive - Static GitHub Pages navigation demo
   Map: MapLibre GL JS + OpenFreeMap vector tiles
   Search: Nominatim
   Routing: OSRM public demo server
*/
(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    map: $('map'),
    menuBtn: $('menuBtn'),
    voiceBtn: $('voiceBtn'),
    mobileModeBtn: $('mobileModeBtn'),
    searchForm: $('searchForm'),
    searchInput: $('searchInput'),
    clearSearchBtn: $('clearSearchBtn'),
    suggestionPanel: $('suggestionPanel'),
    quickPanel: $('quickPanel'),
    navBanner: $('navBanner'),
    maneuverIcon: $('maneuverIcon'),
    nextDistance: $('nextDistance'),
    nextInstruction: $('nextInstruction'),
    rerouteStatus: $('rerouteStatus'),
    offlineBadge: $('offlineBadge'),
    routeSheet: $('routeSheet'),
    closeRouteBtn: $('closeRouteBtn'),
    routeTitle: $('routeTitle'),
    routeEta: $('routeEta'),
    routeDistance: $('routeDistance'),
    routeDuration: $('routeDuration'),
    startNavBtn: $('startNavBtn'),
    recenterBtn: $('recenterBtn'),
    stepsBtn: $('stepsBtn'),
    stepsList: $('stepsList'),
    gpsBtn: $('gpsBtn'),
    driveHud: $('driveHud'),
    speedText: $('speedText'),
    hudEta: $('hudEta'),
    toast: $('toast')
  };

  const styles = [
    { name: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
    { name: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
    { name: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' }
  ];

  const state = {
    map: null,
    styleIndex: 0,
    userMarker: null,
    destMarker: null,
    alertMarkers: [],
    watchId: null,
    current: null,
    previous: null,
    destination: null,
    route: null,
    steps: [],
    routeCoords: [],
    routeLineReady: false,
    navigation: false,
    following: true,
    voice: false,
    spoken: new Set(),
    lastSearchAt: 0,
    searchController: null,
    selectedName: '',
    demoTimer: null,
    demoIndex: 0,
    lastAnnounceTime: 0,
    rerouting: false,
    lastRerouteAt: 0,
    offRouteSince: 0,
    routeHealthText: '',
    mobileMode: false,
    compactPreference: localStorage.getItem('pulseNavMobileUi'),
    online: navigator.onLine !== false,
    lastOfflineNoticeAt: 0
  };

  const richmond = [-77.4360, 37.5407];

  const STORAGE_KEYS = {
    places: 'pulseNavOfflinePlacesV1',
    search: 'pulseNavSearchCacheV1',
    routes: 'pulseNavRouteCacheV1'
  };

  const seededOfflinePlaces = [
    {
      id: 'seed-president-gerald-r-ford-park',
      name: 'President Gerald R. Ford Park',
      display: '1426 Janneys Lane, Alexandria, VA 22302 · built-in offline place',
      lat: 38.816947,
      lon: -77.089031,
      type: 'park',
      icon: '🌳',
      offline: true,
      offlineSource: 'Built-in',
      aliases: ['harald r ford park', 'harold r ford park', 'gerald r ford park', 'gerald ford park', 'ford park alexandria']
    },
    {
      id: 'seed-richmond-virginia',
      name: 'Richmond, VA',
      display: 'Richmond, Virginia · built-in offline city',
      lat: 37.5407,
      lon: -77.4360,
      type: 'city',
      icon: '🏙️',
      offline: true,
      offlineSource: 'Built-in',
      aliases: ['richmond', 'richmond va', 'rva']
    },
    {
      id: 'seed-washington-dc',
      name: 'Washington, DC',
      display: 'Washington, District of Columbia · built-in offline city',
      lat: 38.9072,
      lon: -77.0369,
      type: 'city',
      icon: '🏛️',
      offline: true,
      offlineSource: 'Built-in',
      aliases: ['washington dc', 'dc', 'district of columbia']
    },
    {
      id: 'seed-new-york-city',
      name: 'New York City',
      display: 'New York, NY · built-in offline city',
      lat: 40.7128,
      lon: -74.0060,
      type: 'city',
      icon: '🏙️',
      offline: true,
      offlineSource: 'Built-in',
      aliases: ['new york', 'nyc', 'new york city']
    }
  ];

  function boot() {
    if (!window.maplibregl) {
      showToast('Map engine did not load. Check your connection.');
      return;
    }

    state.map = new maplibregl.Map({
      container: 'map',
      style: styles[state.styleIndex].url,
      center: richmond,
      zoom: 12.2,
      pitch: 54,
      bearing: -12,
      attributionControl: false,
      maxPitch: 78
    });

    state.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    state.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    state.map.on('load', () => {
      setupRouteLayers();
      add3DBuildings();
      applyUrlDestination();
      locateUser({ quiet: true, track: true });
    });

    state.map.on('style.load', () => {
      state.routeLineReady = false;
      setupRouteLayers();
      add3DBuildings();
      if (state.route) drawRoute(state.route.geometry.coordinates);
    });

    state.mobileMode = state.compactPreference ? state.compactPreference === 'on' : window.matchMedia('(max-width: 560px)').matches;
    applyMobileMode(false);
    bindEvents();
    setupOfflineAwareness();
    registerServiceWorker();
  }

  function bindEvents() {
    els.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      searchPlaces(els.searchInput.value.trim(), true);
    });

    els.searchInput.addEventListener('input', debounce(() => {
      const q = els.searchInput.value.trim();
      els.clearSearchBtn.classList.toggle('hidden', !q);
      if (q.length >= 3) searchPlaces(q, false);
      else hideSuggestions();
    }, 420));

    els.clearSearchBtn.addEventListener('click', () => {
      els.searchInput.value = '';
      els.clearSearchBtn.classList.add('hidden');
      hideSuggestions();
      els.searchInput.focus();
    });

    els.gpsBtn.addEventListener('click', () => locateUser({ quiet: false, track: true, recenter: true }));
    els.recenterBtn.addEventListener('click', () => followUser(true));
    els.closeRouteBtn.addEventListener('click', clearRoute);
    els.stepsBtn.addEventListener('click', () => els.stepsList.classList.toggle('hidden'));
    els.startNavBtn.addEventListener('click', startNavigation);
    els.voiceBtn.addEventListener('click', toggleVoice);
    els.mobileModeBtn.addEventListener('click', toggleMobileMode);
    els.offlineBadge?.addEventListener('click', showOfflineKit);
    els.menuBtn.addEventListener('click', () => els.quickPanel.classList.toggle('hidden'));

    window.addEventListener('resize', debounce(() => {
      if (!state.compactPreference) {
        state.mobileMode = window.matchMedia('(max-width: 560px)').matches;
        applyMobileMode(false);
      }
    }, 180));

    els.quickPanel.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      els.quickPanel.classList.add('hidden');
      if (action === 'mobile') toggleMobileMode();
      if (action === 'offline') showOfflineKit();
      if (action === 'style') switchStyle();
      if (action === 'home') locateUser({ quiet: false, track: true, recenter: true });
      if (action === 'demo') demoDrive();
      if (action === 'traffic') addRoadAlert();
    });

    state.map?.on?.('dragstart', () => { state.following = false; });
  }


  function toggleMobileMode() {
    state.mobileMode = !state.mobileMode;
    state.compactPreference = state.mobileMode ? 'on' : 'off';
    localStorage.setItem('pulseNavMobileUi', state.compactPreference);
    applyMobileMode(true);
    if (state.navigation) followUser(true);
    else if (state.route) fitRoute();
  }

  function applyMobileMode(announce = false) {
    document.body.classList.toggle('mobile-ui-mode', state.mobileMode);
    els.mobileModeBtn.classList.toggle('on', state.mobileMode);
    els.mobileModeBtn.setAttribute('aria-pressed', String(state.mobileMode));
    els.mobileModeBtn.setAttribute('aria-label', state.mobileMode ? 'Turn compact mobile UI off' : 'Turn compact mobile UI on');
    if (announce) showToast(state.mobileMode ? 'Compact mobile UI on.' : 'Full drive UI on.');
  }

  function setupRouteLayers() {
    const map = state.map;
    if (!map || state.routeLineReady) return;
    try {
      if (!map.getSource('route')) {
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} }
        });
      }
      if (!map.getLayer('route-glow')) {
        map.addLayer({
          id: 'route-glow', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 14, 'line-opacity': .72, 'line-blur': 2 }
        });
      }
      if (!map.getLayer('route-line')) {
        map.addLayer({
          id: 'route-line', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#6d62ff', 'line-width': 8, 'line-opacity': .97 }
        });
      }
      state.routeLineReady = true;
    } catch (err) {
      console.warn('Route layer setup failed:', err);
    }
  }

  function add3DBuildings() {
    const map = state.map;
    if (!map || map.getLayer('pulse-buildings')) return;
    try {
      const source = map.getSource('openmaptiles') ? 'openmaptiles' : Object.keys(map.style.sourceCaches || {})[0];
      if (!source) return;
      map.addLayer({
        id: 'pulse-buildings',
        source,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': '#d7dde8',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
          'fill-extrusion-opacity': .45
        }
      });
    } catch (err) {
      // Some styles may not expose building data. The app still works without this.
    }
  }

  async function searchPlaces(rawQuery, submitSearch) {
    const q = normalizeQuery(rawQuery);
    if (!q) return;

    const now = Date.now();
    if (!submitSearch && now - state.lastSearchAt < 350) return;
    state.lastSearchAt = now;

    const offlineMatches = searchOfflinePlaces(q).slice(0, submitSearch ? 10 : 6);

    if (!navigator.onLine) {
      if (offlineMatches.length) {
        renderSuggestions(markOfflineSuggestions(offlineMatches));
        if (submitSearch) selectPlace(offlineMatches[0]);
      } else {
        renderSuggestions([{ empty: true, title: 'Not in offline search yet', sub: 'Search it once while online, then PulseNav can find it offline later.' }]);
      }
      updateOfflineBadge();
      return;
    }

    state.searchController?.abort();
    state.searchController = new AbortController();
    renderSuggestions([{ loading: true, title: 'Searching places…' }]);

    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        q,
        limit: submitSearch ? '10' : '6',
        addressdetails: '1',
        namedetails: '1'
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        signal: state.searchController.signal,
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`Search failed ${res.status}`);
      let data = await res.json();

      // For common misspellings, retry one high-confidence known correction.
      if (!data.length && /harald|gerald|ford\s+park/i.test(rawQuery)) {
        const fixed = new URLSearchParams({ format: 'jsonv2', q: 'President Gerald R. Ford Park', limit: '6', addressdetails: '1', namedetails: '1' });
        const retry = await fetch(`https://nominatim.openstreetmap.org/search?${fixed}`);
        data = retry.ok ? await retry.json() : [];
      }

      let places = data.map(placeFromNominatim);
      if (places.length) {
        cacheSearchResults(q, places);
        places.forEach(saveOfflinePlace);
      }

      const combined = dedupePlaces([...places, ...markOfflineSuggestions(offlineMatches).slice(0, 4)]).slice(0, submitSearch ? 10 : 8);

      if (!combined.length) {
        renderSuggestions([{ empty: true, title: 'No places found', sub: 'Try a city, address, park, business, or a more exact name.' }]);
        return;
      }

      renderSuggestions(combined);
      if (submitSearch && combined[0]) selectPlace(combined[0]);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (offlineMatches.length) {
        renderSuggestions(markOfflineSuggestions(offlineMatches));
        if (submitSearch) selectPlace(offlineMatches[0]);
        showToast('Online search failed, so PulseNav used offline search results.');
        return;
      }
      renderSuggestions([{ empty: true, title: 'Search is unavailable', sub: 'No offline match yet. Search this place once while online to save it.' }]);
    } finally {
      updateOfflineBadge();
    }
  }

  function setupOfflineAwareness() {
    updateOfflineBadge();
    window.addEventListener('online', () => {
      state.online = true;
      updateOfflineBadge();
      showToast('Back online. Live search and routing are available.');
    });
    window.addEventListener('offline', () => {
      state.online = false;
      updateOfflineBadge();
      showToast('Offline mode. Saved place search and cached routes are available.');
    });
  }

  function updateOfflineBadge() {
    if (!els.offlineBadge) return;
    const savedPlaces = getSavedPlaces().length;
    const cachedRoutes = getRouteCache().length;
    const offline = navigator.onLine === false;
    els.offlineBadge.classList.toggle('offline', offline);
    els.offlineBadge.classList.toggle('ready', !offline);
    els.offlineBadge.textContent = offline
      ? `Offline: ${savedPlaces + seededOfflinePlaces.length} places · ${cachedRoutes} routes`
      : `Offline ready · ${savedPlaces + seededOfflinePlaces.length} places · ${cachedRoutes} routes`;
  }

  function showOfflineKit() {
    const places = searchOfflinePlaces('').slice(0, 8);
    const routes = getRouteCache();
    renderSuggestions([
      { empty: true, title: 'Offline kit', sub: `${places.length} saved/built-in places shown below · ${routes.length} cached routes ready if your start point is close.` },
      ...markOfflineSuggestions(places)
    ]);
    showToast('Offline search works for built-in places and places you searched while online. New route calculation still needs internet unless that route is cached.');
    updateOfflineBadge();
  }

  function searchOfflinePlaces(query) {
    const q = cleanText(query);
    const terms = q ? q.split(' ').filter(Boolean) : [];
    const fromSeeds = seededOfflinePlaces.map(p => ({ ...p, badge: p.offlineSource || 'Offline' }));
    const saved = getSavedPlaces().map(p => ({ ...p, offline: true, badge: p.badge || 'Saved' }));
    const searchCache = Object.values(getSearchCache()).flat().map(p => ({ ...p, offline: true, badge: p.badge || 'Cached' }));
    const pool = dedupePlaces([...fromSeeds, ...saved, ...searchCache]);

    return pool
      .map(place => ({ place, score: offlinePlaceScore(place, q, terms) }))
      .filter(item => !q || item.score > 0)
      .sort((a, b) => b.score - a.score || String(a.place.name).localeCompare(String(b.place.name)))
      .map(item => item.place);
  }

  function offlinePlaceScore(place, q, terms) {
    const haystack = cleanText(`${place.name || ''} ${place.display || ''} ${(place.aliases || []).join(' ')}`);
    if (!q) return place.offlineSource === 'Built-in' ? 40 : 25;
    let score = 0;
    if (haystack === q) score += 120;
    if (haystack.includes(q)) score += 85;
    for (const term of terms) {
      if (haystack.includes(term)) score += 20;
    }
    if (place.name && cleanText(place.name).startsWith(q)) score += 35;
    if (place.offlineSource === 'Built-in') score += 8;
    if (place.savedAt) score += Math.max(0, 10 - (Date.now() - place.savedAt) / 86400000);
    return score;
  }

  function markOfflineSuggestions(places) {
    return places.map(place => ({
      ...place,
      offline: true,
      badge: place.badge || place.offlineSource || 'Saved',
      display: place.display || 'Saved offline place'
    }));
  }

  function cacheSearchResults(query, places) {
    const cache = getSearchCache();
    cache[cleanText(query)] = places.slice(0, 8).map(lightweightPlace);
    const entries = Object.entries(cache).slice(-35);
    writeJson(STORAGE_KEYS.search, Object.fromEntries(entries));
  }

  function saveOfflinePlace(place) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
    const saved = getSavedPlaces();
    const light = { ...lightweightPlace(place), savedAt: Date.now(), badge: 'Saved' };
    const next = [light, ...saved.filter(p => placeKey(p) !== placeKey(light))].slice(0, 80);
    writeJson(STORAGE_KEYS.places, next);
    updateOfflineBadge();
  }

  function lightweightPlace(place) {
    return {
      id: place.id || placeKey(place),
      name: place.name || 'Saved place',
      display: place.display || place.name || 'Saved place',
      lat: Number(place.lat),
      lon: Number(place.lon),
      type: place.type || 'place',
      icon: place.icon || iconForPlace(place.type),
      aliases: place.aliases || []
    };
  }

  function dedupePlaces(places) {
    const seen = new Set();
    const out = [];
    for (const place of places) {
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
      const key = placeKey(place);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(place);
    }
    return out;
  }

  function placeKey(place) {
    return `${cleanText(place.name || 'place')}@${Number(place.lat).toFixed(4)},${Number(place.lon).toFixed(4)}`;
  }

  function getSavedPlaces() { return readJson(STORAGE_KEYS.places, []); }
  function getSearchCache() { return readJson(STORAGE_KEYS.search, {}); }
  function getRouteCache() { return readJson(STORAGE_KEYS.routes, []); }

  function cacheRoute(place, route) {
    if (!state.current || !route?.geometry?.coordinates?.length) return;
    const item = {
      savedAt: Date.now(),
      name: place.name,
      from: { lon: Number(state.current.lon), lat: Number(state.current.lat) },
      to: { lon: Number(place.lon), lat: Number(place.lat) },
      route
    };
    const routes = getRouteCache();
    const next = [item, ...routes.filter(r => routeCacheKey(r) !== routeCacheKey(item))].slice(0, 10);
    writeJson(STORAGE_KEYS.routes, next);
    updateOfflineBadge();
  }

  function findCachedRoute(place) {
    if (!state.current || !place) return null;
    const routes = getRouteCache();
    let best = null;
    for (const item of routes) {
      if (!item?.route?.geometry?.coordinates?.length) continue;
      const fromDist = distanceMeters([state.current.lon, state.current.lat], [item.from.lon, item.from.lat]);
      const toDist = distanceMeters([place.lon, place.lat], [item.to.lon, item.to.lat]);
      if (fromDist <= 450 && toDist <= 250) {
        const score = fromDist + toDist;
        if (!best || score < best.score) best = { score, item };
      }
    }
    return best?.item || null;
  }

  function routeCacheKey(item) {
    return `${Number(item.from?.lat).toFixed(3)},${Number(item.from?.lon).toFixed(3)}>${Number(item.to?.lat).toFixed(3)},${Number(item.to?.lon).toFixed(3)}`;
  }

  function applyRoute(place, route, options = {}) {
    state.route = route;
    state.steps = state.route.legs?.[0]?.steps || [];
    state.routeCoords = state.route.geometry.coordinates;
    state.spoken.clear();
    state.offRouteSince = 0;
    drawRoute(state.routeCoords);
    showRouteSheet(place.name, state.route);
    renderSteps();
    updateGuidance();

    if (options.cached) {
      setRerouteStatus('Offline cached route', 'good');
      showToast('Loaded a cached route from this area. Live rerouting needs internet.');
      fitRoute();
      return;
    }

    if (options.reroute) {
      setRerouteStatus('Route updated', 'good');
      showToast('Rerouted from your current position.');
      speak('Route updated.');
      if (state.navigation) followUser(true);
    } else {
      fitRoute();
      showToast('Route ready. Tap Start drive for tilted follow mode.');
    }
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('Offline cache write failed:', err);
    }
  }

  function cleanText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeQuery(raw) {
    let q = raw.trim();
    if (!q) return '';
    const low = q.toLowerCase().replace(/[.]/g, '');
    if (low.includes('harald r ford park') || low.includes('harold r ford park')) return 'President Gerald R. Ford Park';
    return q;
  }

  function placeFromNominatim(item) {
    const name = item.namedetails?.name || item.name || item.display_name?.split(',')[0] || 'Selected place';
    const type = item.type || item.class || 'place';
    return {
      id: item.place_id,
      name,
      display: item.display_name,
      lat: Number(item.lat),
      lon: Number(item.lon),
      type,
      icon: iconForPlace(type, item.class),
      raw: item
    };
  }

  function renderSuggestions(items) {
    els.suggestionPanel.innerHTML = '';
    els.suggestionPanel.classList.remove('hidden');

    items.forEach((place) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'suggestion-item';
      if (place.loading || place.empty) btn.disabled = true;
      btn.innerHTML = `
        <span class="suggestion-icon">${place.loading ? '…' : place.empty ? '!' : place.icon}</span>
        <span><span class="suggestion-title">${escapeHtml(place.title || place.name)}</span><span class="suggestion-sub">${escapeHtml(place.sub || place.display || '')}</span></span>
        <span class="suggestion-badge">${place.loading ? 'wait' : place.empty ? 'info' : (place.badge || (place.offline ? 'Saved' : 'Go'))}</span>`;
      if (!place.loading && !place.empty) btn.addEventListener('click', () => selectPlace(place));
      els.suggestionPanel.appendChild(btn);
    });
  }

  function hideSuggestions() { els.suggestionPanel.classList.add('hidden'); }

  async function selectPlace(place) {
    hideSuggestions();
    state.destination = place;
    state.selectedName = place.name;
    els.searchInput.value = place.name;
    els.clearSearchBtn.classList.remove('hidden');
    saveOfflinePlace(place);
    setDestinationMarker([place.lon, place.lat]);
    state.map.flyTo({ center: [place.lon, place.lat], zoom: 15.2, pitch: 58, bearing: state.map.getBearing(), duration: 1000 });
    updateUrl(place);
    await routeToDestination(place);
  }

  function setDestinationMarker(lngLat) {
    state.destMarker?.remove();
    const el = document.createElement('div');
    el.className = 'dest-marker';
    el.textContent = '📍';
    state.destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(state.map);
  }

  async function routeToDestination(place, options = {}) {
    if (!state.current) {
      showToast('Allow location for a real route from where you are. Using map center for now.');
      const c = state.map.getCenter();
      state.current = { lat: c.lat, lon: c.lng, heading: state.map.getBearing(), speed: 0, synthetic: true };
      updateUserMarker(state.current);
    }

    const cached = findCachedRoute(place);
    if (!navigator.onLine) {
      if (cached) {
        applyRoute(place, cached.route, { cached: true });
      } else {
        setRerouteStatus('Offline search only', 'warning');
        showToast('Offline route calculation is not available for new routes. Go online once to cache this route.');
      }
      updateOfflineBadge();
      return;
    }

    const from = `${state.current.lon},${state.current.lat}`;
    const to = `${place.lon},${place.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${from};${to}?overview=full&geometries=geojson&steps=true&alternatives=false`;

    state.rerouting = Boolean(options.reroute);
    setRouteLoading(true);
    if (options.reroute) setRerouteStatus('Rerouting…', 'active');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Route failed ${res.status}`);
      const data = await res.json();
      if (!data.routes?.length) throw new Error('No route returned');
      cacheRoute(place, data.routes[0]);
      applyRoute(place, data.routes[0], { reroute: options.reroute });
    } catch (err) {
      console.error(err);
      if (cached) {
        applyRoute(place, cached.route, { cached: true });
        return;
      }
      if (options.reroute) setRerouteStatus('Reroute failed', 'warning');
      showToast('Could not calculate a route right now. Try again in a moment.');
    } finally {
      state.rerouting = false;
      setRouteLoading(false);
      updateOfflineBadge();
    }
  }

  function setRouteLoading(loading) {
    els.startNavBtn.disabled = loading;
    els.startNavBtn.textContent = loading ? (state.rerouting ? 'Rerouting…' : 'Routing…') : state.navigation ? 'Driving' : 'Start drive';
  }

  function drawRoute(coords) {
    setupRouteLayers();
    const source = state.map.getSource('route');
    if (!source) return;
    source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords || [] }, properties: {} });
  }

  function showRouteSheet(title, route) {
    els.routeSheet.classList.remove('hidden');
    els.routeTitle.textContent = title;
    els.routeDistance.textContent = formatDistance(route.distance);
    els.routeDuration.textContent = formatDuration(route.duration);
    const eta = new Date(Date.now() + route.duration * 1000);
    els.routeEta.textContent = eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    els.hudEta.textContent = els.routeEta.textContent;
  }

  function fitRoute() {
    if (!state.routeCoords.length) return;
    const bounds = new maplibregl.LngLatBounds();
    state.routeCoords.forEach(coord => bounds.extend(coord));
    const padding = state.mobileMode
      ? { top: 150, bottom: 210, left: 34, right: 34 }
      : { top: 210, bottom: 250, left: 70, right: 70 };
    state.map.fitBounds(bounds, { padding, pitch: state.mobileMode ? 58 : 54, duration: 1100 });
  }

  function startNavigation() {
    if (!state.route) {
      showToast('Pick a destination first.');
      return;
    }
    state.navigation = true;
    state.following = true;
    els.navBanner.classList.remove('hidden');
    els.driveHud.classList.remove('hidden');
    els.startNavBtn.textContent = 'Driving';
    els.gpsBtn.classList.add('active');
    speak('Starting route. Drive safely.');
    setRerouteStatus('Auto-reroute on', 'good');
    updateGuidance();
    followUser(true);
  }

  function updateGuidance() {
    if (!state.steps.length) return;
    const next = getNextStep();
    if (!next) return;
    const instruction = instructionForStep(next.step);
    els.nextInstruction.textContent = instruction;
    els.nextDistance.textContent = next.distance ? `${formatDistance(next.distance)} ahead` : 'Continue';
    els.maneuverIcon.textContent = iconForManeuver(next.step.maneuver);
    if (state.navigation && state.voice && next.distance < 430 && !state.spoken.has(next.index)) {
      speak(`${formatDistance(next.distance)}. ${instruction}`);
      state.spoken.add(next.index);
    }
  }

  function getNextStep() {
    if (!state.current || !state.steps.length) return null;
    let best = null;
    for (let i = 0; i < state.steps.length; i++) {
      const step = state.steps[i];
      if (!step.maneuver?.location) continue;
      const d = distanceMeters([state.current.lon, state.current.lat], step.maneuver.location);
      if (!best || d < best.distance) best = { step, index: i, distance: d };
    }
    // Prefer the next not-yet-spoken meaningful maneuver when close enough.
    const unspoken = state.steps
      .map((step, index) => ({ step, index, distance: step.maneuver?.location ? distanceMeters([state.current.lon, state.current.lat], step.maneuver.location) : Infinity }))
      .filter(x => !state.spoken.has(x.index) && x.step.maneuver?.type !== 'depart')
      .sort((a, b) => a.distance - b.distance)[0];
    return unspoken || best;
  }

  function renderSteps() {
    els.stepsList.innerHTML = '';
    state.steps.forEach((step, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="step-icon">${iconForManeuver(step.maneuver)}</span><span><b>${escapeHtml(instructionForStep(step))}</b><span>${escapeHtml(step.name || 'Unnamed road')}</span></span><small>${formatDistance(step.distance || 0)}</small>`;
      els.stepsList.appendChild(li);
    });
  }

  function locateUser({ quiet = false, track = false, recenter = false } = {}) {
    if (!navigator.geolocation) {
      if (!quiet) showToast('Geolocation is not supported in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handlePosition(pos);
        if (recenter || !state.destination) followUser(true);
        if (track && !state.watchId) {
          state.watchId = navigator.geolocation.watchPosition(handlePosition, geoError, {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 12000
          });
        }
      },
      (err) => { if (!quiet) geoError(err); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 11000 }
    );
  }

  function handlePosition(pos) {
    const coords = pos.coords;
    state.previous = state.current;
    const computedHeading = state.previous ? bearingBetween([state.previous.lon, state.previous.lat], [coords.longitude, coords.latitude]) : 0;
    state.current = {
      lat: coords.latitude,
      lon: coords.longitude,
      heading: Number.isFinite(coords.heading) ? coords.heading : computedHeading,
      speed: Math.max(0, coords.speed || 0),
      accuracy: coords.accuracy
    };
    updateUserMarker(state.current);
    els.speedText.textContent = Math.round(state.current.speed * 2.23694);
    if (state.navigation) {
      updateGuidance();
      checkForReroute();
    }
    if (state.following) followUser(false);
  }

  function updateUserMarker(p) {
    const lngLat = [p.lon, p.lat];
    if (!state.userMarker) {
      const el = document.createElement('div');
      el.className = 'vehicle-marker';
      state.userMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
        .setLngLat(lngLat)
        .addTo(state.map);
    } else {
      state.userMarker.setLngLat(lngLat);
    }
    if (typeof state.userMarker.setRotation === 'function') {
      state.userMarker.setRotation(p.heading || 0);
    }
  }

  function followUser(force) {
    if (!state.current) {
      locateUser({ quiet: false, track: true, recenter: true });
      return;
    }
    state.following = true;
    const routeBearing = getRouteBearingNearUser() ?? state.current.heading ?? state.map.getBearing();
    const pitch = state.navigation ? (state.mobileMode ? 72 : 68) : (state.mobileMode ? 60 : 56);
    const zoom = state.navigation ? (state.mobileMode ? 17.35 : 17.1) : (state.mobileMode ? 15.5 : 15.2);
    const offset = state.navigation
      ? [0, Math.round(window.innerHeight * (state.mobileMode ? 0.16 : 0.22))]
      : [0, state.mobileMode ? Math.round(window.innerHeight * 0.04) : 0];
    state.map.easeTo({
      center: [state.current.lon, state.current.lat],
      zoom,
      pitch,
      bearing: routeBearing,
      offset,
      duration: force ? 900 : 650,
      easing: t => 1 - Math.pow(1 - t, 3)
    });
  }

  function getRouteBearingNearUser() {
    if (!state.routeCoords.length || !state.current) return null;
    let bestIndex = 0;
    let bestDist = Infinity;
    const user = [state.current.lon, state.current.lat];
    for (let i = 0; i < state.routeCoords.length; i += 2) {
      const d = distanceMeters(user, state.routeCoords[i]);
      if (d < bestDist) { bestDist = d; bestIndex = i; }
    }
    const next = state.routeCoords[Math.min(bestIndex + 3, state.routeCoords.length - 1)];
    if (!next) return null;
    return bearingBetween(state.routeCoords[bestIndex], next);
  }

  function checkForReroute() {
    if (!state.navigation || !state.route || !state.destination || !state.routeCoords.length || !state.current) return;
    if (state.current.synthetic || state.rerouting) return;
    if (!navigator.onLine) {
      setRerouteStatus('Offline · reroute paused', 'warning');
      return;
    }

    const now = Date.now();
    const accuracy = Number.isFinite(state.current.accuracy) ? state.current.accuracy : 0;
    if (accuracy > 140) {
      setRerouteStatus('GPS accuracy low', 'warning');
      return;
    }

    const distanceFromRoute = distanceToRouteMeters([state.current.lon, state.current.lat], state.routeCoords);
    const threshold = Math.max(70, Math.min(130, accuracy * 1.8 || 70));

    if (distanceFromRoute <= threshold) {
      state.offRouteSince = 0;
      setRerouteStatus('On route', 'good');
      return;
    }

    if (!state.offRouteSince) state.offRouteSince = now;
    const secondsOffRoute = (now - state.offRouteSince) / 1000;
    setRerouteStatus(`Off route · ${Math.round(distanceFromRoute)}m`, 'warning');

    const enoughTimeOffRoute = secondsOffRoute > 5.5;
    const cooldownReady = now - state.lastRerouteAt > 14000;
    if (enoughTimeOffRoute && cooldownReady) {
      state.lastRerouteAt = now;
      routeToDestination(state.destination, { reroute: true });
    }
  }

  function distanceToRouteMeters(point, line) {
    if (!line || line.length === 0) return Infinity;
    if (line.length === 1) return distanceMeters(point, line[0]);
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const d = distancePointToSegmentMeters(point, line[i], line[i + 1]);
      if (d < best) best = d;
    }
    return best;
  }

  function distancePointToSegmentMeters(point, a, b) {
    const lat = toRad(point[1]);
    const metersPerDegLat = 111320;
    const metersPerDegLon = Math.cos(lat) * 111320;
    const px = point[0] * metersPerDegLon;
    const py = point[1] * metersPerDegLat;
    const ax = a[0] * metersPerDegLon;
    const ay = a[1] * metersPerDegLat;
    const bx = b[0] * metersPerDegLon;
    const by = b[1] * metersPerDegLat;
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function setRerouteStatus(text, kind = 'good') {
    if (!els.rerouteStatus) return;
    els.rerouteStatus.textContent = text;
    els.rerouteStatus.classList.toggle('hidden', !text || kind === 'hidden');
    els.rerouteStatus.dataset.status = kind;
  }

  function geoError(err) {
    const msg = err.code === 1 ? 'Location permission was blocked. Enable it for live navigation.' : 'Could not get your location yet.';
    showToast(msg);
  }

  function toggleVoice() {
    state.voice = !state.voice;
    els.voiceBtn.classList.toggle('on', state.voice);
    els.voiceBtn.setAttribute('aria-label', state.voice ? 'Turn voice guidance off' : 'Turn voice guidance on');
    speak(state.voice ? 'Voice guidance on.' : 'Voice guidance off.', true);
  }

  function speak(text, force = false) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      if (force) showToast('Text to speech is not supported in this browser.');
      return;
    }
    if (!state.voice && !force) return;
    const now = Date.now();
    if (!force && now - state.lastAnnounceTime < 2600) return;
    state.lastAnnounceTime = now;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1.02;
    u.pitch = 1.0;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  }

  function switchStyle() {
    state.styleIndex = (state.styleIndex + 1) % styles.length;
    state.map.setStyle(styles[state.styleIndex].url);
    showToast(`Map style: ${styles[state.styleIndex].name}`);
  }

  function addRoadAlert() {
    const center = state.current ? [state.current.lon, state.current.lat] : state.map.getCenter().toArray();
    const el = document.createElement('div');
    el.className = 'alert-marker';
    el.textContent = '⚠';
    const marker = new maplibregl.Marker({ element: el }).setLngLat(center).addTo(state.map);
    state.alertMarkers.push(marker);
    showToast('Local road alert added on your map.');
  }

  function demoDrive() {
    if (!state.routeCoords.length) {
      showToast('Create a route first, then tap Demo drive.');
      return;
    }
    clearInterval(state.demoTimer);
    state.navigation = true;
    state.following = true;
    els.navBanner.classList.remove('hidden');
    els.driveHud.classList.remove('hidden');
    state.demoIndex = 0;
    speak('Demo drive started.', true);
    setRerouteStatus('Demo drive', 'good');
    state.demoTimer = setInterval(() => {
      const coord = state.routeCoords[state.demoIndex];
      const next = state.routeCoords[Math.min(state.demoIndex + 1, state.routeCoords.length - 1)];
      if (!coord || state.demoIndex >= state.routeCoords.length - 1) {
        clearInterval(state.demoTimer);
        speak('You have arrived.', true);
        showToast('Demo drive finished.');
        return;
      }
      state.previous = state.current;
      state.current = {
        lon: coord[0],
        lat: coord[1],
        heading: bearingBetween(coord, next),
        speed: 13.4,
        synthetic: true
      };
      updateUserMarker(state.current);
      els.speedText.textContent = '30';
      updateGuidance();
      followUser(false);
      state.demoIndex += Math.max(1, Math.floor(state.routeCoords.length / 180));
    }, 780);
  }

  function clearRoute() {
    state.route = null;
    state.steps = [];
    state.routeCoords = [];
    state.destination = null;
    state.navigation = false;
    state.spoken.clear();
    state.offRouteSince = 0;
    setRerouteStatus('', 'hidden');
    clearInterval(state.demoTimer);
    state.destMarker?.remove();
    state.destMarker = null;
    drawRoute([]);
    els.routeSheet.classList.add('hidden');
    els.navBanner.classList.add('hidden');
    els.driveHud.classList.add('hidden');
    els.stepsList.classList.add('hidden');
    els.startNavBtn.textContent = 'Start drive';
    const url = new URL(window.location.href);
    url.searchParams.delete('dest');
    history.replaceState(null, '', url);
    updateOfflineBadge();
    showToast('Route cleared.');
  }

  function applyUrlDestination() {
    const params = new URLSearchParams(window.location.search);
    const dest = params.get('dest');
    if (dest) {
      els.searchInput.value = dest;
      els.clearSearchBtn.classList.remove('hidden');
      searchPlaces(dest, true);
    }
  }

  function updateUrl(place) {
    const url = new URL(window.location.href);
    url.searchParams.set('dest', place.name);
    history.replaceState(null, '', url);
  }

  function iconForPlace(type, cls) {
    const combined = `${type || ''} ${cls || ''}`.toLowerCase();
    if (/park|garden|forest|nature/.test(combined)) return '🌳';
    if (/restaurant|cafe|food|bar/.test(combined)) return '🍽';
    if (/school|college|university/.test(combined)) return '🎓';
    if (/shop|mall|store|retail/.test(combined)) return '🛒';
    if (/fuel|gas/.test(combined)) return '⛽';
    if (/hotel|motel/.test(combined)) return '🛏';
    if (/hospital|clinic|doctor/.test(combined)) return '✚';
    return '📍';
  }

  function instructionForStep(step) {
    const m = step.maneuver || {};
    const road = step.name ? ` onto ${step.name}` : '';
    const modifier = m.modifier ? m.modifier.replace('uturn', 'U-turn') : '';
    switch (m.type) {
      case 'depart': return step.name ? `Head ${modifier || 'out'} on ${step.name}` : 'Start driving';
      case 'arrive': return 'You have arrived';
      case 'turn': return `Turn ${modifier}${road}`;
      case 'new name': return `Continue${road}`;
      case 'continue': return `Continue ${modifier || 'straight'}${road}`;
      case 'merge': return `Merge ${modifier}${road}`;
      case 'on ramp': return `Take the ramp ${modifier}${road}`;
      case 'off ramp': return `Take the exit ${modifier}${road}`;
      case 'fork': return `Keep ${modifier}${road}`;
      case 'end of road': return `At the end of the road, turn ${modifier}${road}`;
      case 'roundabout':
      case 'rotary': return `Enter the roundabout and take the ${ordinal(m.exit)} exit${road}`;
      default: return step.name ? `Continue on ${step.name}` : 'Continue';
    }
  }

  function iconForManeuver(m = {}) {
    const type = m.type || '';
    const mod = m.modifier || '';
    if (type === 'arrive') return '🏁';
    if (type === 'roundabout' || type === 'rotary') return '↻';
    if (/left/.test(mod)) return '↰';
    if (/right/.test(mod)) return '↱';
    if (/uturn/.test(mod)) return '↶';
    if (type === 'merge') return '⇢';
    if (type === 'fork') return '⑂';
    return '⬆';
  }

  function ordinal(n) {
    if (!n) return 'next';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return '--';
    const miles = meters / 1609.344;
    if (miles >= 10) return `${Math.round(miles)} mi`;
    if (miles >= .2) return `${miles.toFixed(1)} mi`;
    return `${Math.max(20, Math.round(meters * 3.28084 / 10) * 10)} ft`;
  }

  function formatDuration(seconds) {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }

  function bearingBetween(a, b) {
    const lon1 = toRad(a[0]);
    const lat1 = toRad(a[1]);
    const lon2 = toRad(b[0]);
    const lat2 = toRad(b[1]);
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function distanceMeters(a, b) {
    const R = 6371000;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function toRad(d) { return d * Math.PI / 180; }
  function toDeg(r) { return r * 180 / Math.PI; }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 3300);
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  boot();
})();
