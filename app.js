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
