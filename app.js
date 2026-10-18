const API = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';

const weatherCodes = {
  0: ['Clear sky', '☀'], 1: ['Mainly clear', '🌤'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁'],
  45: ['Fog', '〰'], 48: ['Rime fog', '〰'], 51: ['Light drizzle', '🌦'], 53: ['Drizzle', '🌦'], 55: ['Dense drizzle', '🌧'],
  56: ['Freezing drizzle', '🌧'], 57: ['Freezing drizzle', '🌧'], 61: ['Light rain', '🌦'], 63: ['Rain', '🌧'], 65: ['Heavy rain', '🌧'],
  66: ['Freezing rain', '🌧'], 67: ['Heavy freezing rain', '🌧'], 71: ['Light snow', '🌨'], 73: ['Snow', '🌨'], 75: ['Heavy snow', '❄'], 77: ['Snow grains', '❄'],
  80: ['Rain showers', '🌦'], 81: ['Showers', '🌧'], 82: ['Heavy showers', '🌧'], 85: ['Snow showers', '🌨'], 86: ['Heavy snow showers', '❄'],
  95: ['Thunderstorm', '⛈'], 96: ['Thunderstorm with hail', '⛈'], 97: ['Heavy thunderstorm', '⛈'], 99: ['Thunderstorm with hail', '⛈']
};

const state = { unit: 'celsius', location: null, forecast: null, requestId: 0 };
const $ = (selector) => document.querySelector(selector);
const searchForm = $('#search-form');
const searchInput = $('#city-search');
const searchResults = $('#search-results');
const refreshButton = $('#refresh-button');

function weatherInfo(code) { return weatherCodes[Number(code)] || ['Variable conditions', '☁']; }
function setText(selector, value) { $(selector).textContent = value; }
function toTemp(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const converted = state.unit === 'fahrenheit' ? (Number(value) * 9 / 5) + 32 : Number(value);
  return `${Math.round(converted)}°`;
}
function displayTemp(value) { return toTemp(value); }
function dateFromIso(iso) { return new Date(`${iso}T12:00:00`); }
function formatWeekday(iso, options = { weekday: 'short' }) {
  return new Intl.DateTimeFormat(undefined, options).format(dateFromIso(iso));
}
function windDirection(degrees) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round((Number(degrees) % 360) / 45) % 8];
}
function setMessage(message = '') {
  const box = $('#app-message');
  box.textContent = message;
  box.hidden = !message;
}
function setLoading(loading) {
  document.body.classList.toggle('is-loading', loading);
  refreshButton.disabled = loading;
  if (loading) setMessage('');
}
function placeLabel(place) {
  return [place.admin1, place.country].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join(', ');
}

async function searchPlaces(query) {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' });
  const response = await fetch(`${GEOCODING_API}?${params}`);
  if (!response.ok) throw new Error('Could not search for that place. Try again in a moment.');
  const data = await response.json();
  return data.results || [];
}

function showSearchResults(places, query) {
  searchResults.replaceChildren();
  if (!places.length) {
    const empty = document.createElement('div');
    empty.className = 'search-result';
    empty.innerHTML = '<strong>No matching places</strong><small>Check the spelling and try again.</small>';
    searchResults.append(empty);
    searchResults.hidden = false;
    return;
  }
  for (const place of places) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'search-result';
    option.setAttribute('role', 'option');
    const name = document.createElement('strong');
    name.textContent = place.name;
    const detail = document.createElement('small');
    detail.textContent = placeLabel(place) || place.country_code || 'Location';
    option.append(name, detail);
    option.addEventListener('click', () => {
      searchResults.hidden = true;
      searchInput.value = `${place.name}${place.country ? `, ${place.country}` : ''}`;
      loadForecast(place);
    });
    searchResults.append(option);
  }
  searchResults.dataset.query = query;
  searchResults.hidden = false;
}

async function getForecast(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude), timezone: 'auto', forecast_days: '7',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max'
  });
  const response = await fetch(`${API}?${params}`);
   if (!response.ok) throw new Error('The weather service could not return a forecast. Please try again.');
  const data = await response.json();
  if (!data.current || !data.daily || !data.hourly) throw new Error('The weather service returned incomplete forecast data.');
  return data;
}

async function loadForecast(location) {
  const requestId = ++state.requestId;
  state.location = location;
  setLoading(true);
  try {
    const forecast = await getForecast(location);
    if (requestId !== state.requestId) return;
    state.forecast = forecast;
    renderForecast();
  } catch (error) {
    if (requestId === state.requestId) setMessage(error.message || 'Something went wrong while loading the forecast.');
  } finally {
    if (requestId === state.requestId) setLoading(false);
  }
}

async function searchAndLoad(query, { chooseFirst = false } = {}) {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    setMessage('Enter at least two letters to search for a place.');
    return;
  }
  setLoading(true);
  try {
    const places = await searchPlaces(trimmed);
    if (chooseFirst && places.length) {
      searchResults.hidden = true;
      await loadForecast(places[0]);
    } else {
      showSearchResults(places, trimmed);
      setLoading(false);
      if (!places.length) setMessage(`No place found for “${trimmed}”. Try another city or postcode.`);
    }
  } catch (error) {
    setLoading(false);
    setMessage(error.message || 'Could not search for that place.');
  }
}

function renderCurrent(forecast, location) {
  const current = forecast.current;
  const daily = forecast.daily;
  const info = weatherInfo(current.weather_code);
  const label = location.name || 'My location';
  const region = placeLabel(location) || 'Local forecast';
  setText('#place-name', label);
  setText('#place-region', region);
  setText('#breadcrumb-place', label.toUpperCase());
  $('#current-icon').textContent = info[1];
  setText('#current-temperature', toTemp(current.temperature_2m).replace('°', ''));
  setText('#temperature-unit-mark', state.unit === 'celsius' ? '°C' : '°F');
  setText('#current-summary', info[0]);
  setText('#today-high', toTemp(daily.temperature_2m_max[0]));
  setText('#today-low', toTemp(daily.temperature_2m_min[0]));
  setText('#feels-like', `Feels like ${toTemp(current.apparent_temperature)}`);
  setText('#humidity-value', Math.round(current.relative_humidity_2m));
  $('#humidity-meter').style.width = `${Math.max(0, Math.min(100, current.relative_humidity_2m))}%`;
  const wind = Number(current.wind_speed_10m);
  setText('#wind-value', Math.round(state.unit === 'fahrenheit' ? wind * 0.621371 : wind));
  setText('#wind-unit', state.unit === 'fahrenheit' ? 'mph' : 'km/h');
  const direction = windDirection(current.wind_direction_10m);
  setText('#wind-direction-text', `${direction} · ${Math.round(current.wind_direction_10m)}°`);
  $('#wind-arrow').style.transform = `rotate(${Number(current.wind_direction_10m)}deg)`;
  const rainChance = Math.round(daily.precipitation_probability_max?.[0] ?? 0);
  setText('#rain-value', rainChance);
  $('#rain-meter').style.width = `${Math.max(0, Math.min(100, rainChance))}%`;
  const uv = Number(daily.uv_index_max?.[0] ?? 0);
  setText('#uv-value', Number.isInteger(uv) ? uv : uv.toFixed(1));
  setText('#uv-level', uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : uv < 11 ? 'Very high' : 'Extreme');
  $('#uv-indicator').style.left = `${Math.min(96, Math.max(0, uv / 11 * 100))}%`;
  const currentTime = new Date(current.time);
  setText('#current-local-time', Number.isNaN(currentTime.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: forecast.timezone }).format(currentTime));
  setText('#today-date', new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: forecast.timezone }).format(currentTime));
  setText('#updated-at', `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())}`);
}

function renderHourly(forecast) {
  const { hourly, current } = forecast;
   const start = Math.max(0, hourly.time.findIndex((time) => time >= current.time));
  const first = start < 0 ? 0 : start;
  const list = $('#hourly-forecast');
  list.replaceChildren();
  for (let index = first; index < Math.min(hourly.time.length, first + 8); index += 1) {
    const card = document.createElement('article');
    card.className = `hour-card${index === first ? ' current-hour' : ''}`;
    const hour = document.createElement('div');
    hour.className = 'hour-time';
    hour.textContent = index === first ? 'Now' : hourly.time[index].slice(11, 16);
    const icon = document.createElement('div');
    icon.className = 'hour-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = weatherInfo(hourly.weather_code[index])[1];
    const temp = document.createElement('div');
    temp.className = 'hour-temp';
    temp.textContent = toTemp(hourly.temperature_2m[index]);
    const rain = document.createElement('div');
    rain.className = 'hour-rain';
    rain.innerHTML = `<span aria-hidden="true">⌁</span>${Math.round(hourly.precipitation_probability[index] ?? 0)}%`;
    card.append(hour, icon, temp, rain);
    list.append(card);
  }
}

function renderDaily(forecast) {
  const { daily } = forecast;
  const list = $('#daily-forecast');
  list.replaceChildren();
  const lows = daily.temperature_2m_min.map(Number);
  const highs = daily.temperature_2m_max.map(Number);
  const rangeMin = Math.min(...lows);
  const rangeMax = Math.max(...highs);
  for (let index = 0; index < daily.time.length; index += 1) {
    const row = document.createElement('div');
    row.className = 'daily-row';
    const day = document.createElement('div');
    day.className = `daily-day${index === 0 ? ' today' : ''}`;
    day.textContent = index === 0 ? 'Today' : formatWeekday(daily.time[index]);
    const condition = document.createElement('div');
    condition.className = 'daily-condition';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = weatherInfo(daily.weather_code[index])[1];
    const description = document.createElement('span');
    description.textContent = weatherInfo(daily.weather_code[index])[0];
    condition.append(icon, description);
    const rain = document.createElement('div');
    rain.className = 'daily-rain';
    rain.textContent = `${Math.round(daily.precipitation_probability_max?.[index] ?? 0)}% rain`;
    const temps = document.createElement('div');
    temps.className = 'daily-temperatures';
    const low = document.createElement('span');
    low.textContent = toTemp(lows[index]);
    const high = document.createElement('strong');
    high.textContent = toTemp(highs[index]);
    temps.append(low, high);
    const track = document.createElement('div');
    track.className = 'daily-range';
    track.setAttribute('aria-label', `Temperature range ${toTemp(lows[index])} to ${toTemp(highs[index])}`);
    const bar = document.createElement('span');
    const spread = Math.max(1, rangeMax - rangeMin);
    const left = Math.max(0, (lows[index] - rangeMin) / spread * 100);
    const width = Math.max(8, (highs[index] - lows[index]) / spread * 100);
    bar.style.left = `${left}%`;
    bar.style.width = `${Math.min(100 - left, width)}%`;
    track.append(bar);
    row.append(day, condition, rain, temps, track);
    list.append(row);
  }
}

function renderForecast() {
  if (!state.forecast || !state.location) return;
  renderCurrent(state.forecast, state.location);
  renderHourly(state.forecast);
  renderDaily(state.forecast);
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  searchAndLoad(searchInput.value, { chooseFirst: true });
});
searchInput.addEventListener('input', () => {
  if (searchInput.value.trim().length >= 2) searchAndLoad(searchInput.value);
  else searchResults.hidden = true;
});
document.addEventListener('click', (event) => {
  if (!searchForm.contains(event.target) && !searchResults.contains(event.target)) searchResults.hidden = true;
});
document.querySelectorAll('[data-city]').forEach((button) => {
  button.addEventListener('click', () => {
    searchInput.value = button.dataset.city;
    searchAndLoad(button.dataset.city, { chooseFirst: true });
  });
});
document.querySelectorAll('[data-unit]').forEach((button) => {
  button.addEventListener('click', () => {
    state.unit = button.dataset.unit;
    document.querySelectorAll('[data-unit]').forEach((option) => {
      const active = option === button;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    });
    renderForecast();
  });
});
refreshButton.addEventListener('click', () => state.location && loadForecast(state.location));
$('#location-button').addEventListener('click', () => {
  if (!navigator.geolocation) {
    setMessage('This browser does not support location access. Search for a city instead.');
    return;
     }
  setMessage('');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      searchResults.hidden = true;
      searchInput.value = '';
      loadForecast({ latitude: coords.latitude, longitude: coords.longitude, name: 'My location', country: '', admin1: '' });
    },
    () => setMessage('Location access was unavailable. You can search for a city instead.'),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
     );
});

// Start with a useful sample location. Search or use the location button to change it.
searchAndLoad('New Delhi', { chooseFirst: true });
