// -- Open-Meteo API types --

interface GeocodingResult {
  results?: Array<{
    name: string
    latitude: number
    longitude: number
    country: string
    timezone: string
  }>
}

interface OpenMeteoWeather {
  current: {
    temperature_2m: number
    relative_humidity_2m: number
    apparent_temperature: number
    weather_code: number
    wind_speed_10m: number
    precipitation: number
    is_day: number
  }
  daily?: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}

// -- WMO Weather Code Mapping --
// https://open-meteo.com/en/docs#weathervariables

const wmoCodeToCondition: Record<number, { conditionCode: string, condition: string }> = {
  0: { conditionCode: 'clear-day', condition: 'Clear sky' },
  1: { conditionCode: 'clear-day', condition: 'Mainly clear' },
  2: { conditionCode: 'partly-cloudy-day', condition: 'Partly cloudy' },
  3: { conditionCode: 'overcast', condition: 'Overcast' },
  45: { conditionCode: 'fog', condition: 'Fog' },
  48: { conditionCode: 'fog', condition: 'Depositing rime fog' },
  51: { conditionCode: 'drizzle', condition: 'Light drizzle' },
  53: { conditionCode: 'drizzle', condition: 'Moderate drizzle' },
  55: { conditionCode: 'drizzle', condition: 'Dense drizzle' },
  56: { conditionCode: 'sleet', condition: 'Freezing drizzle' },
  57: { conditionCode: 'sleet', condition: 'Dense freezing drizzle' },
  61: { conditionCode: 'rain', condition: 'Slight rain' },
  63: { conditionCode: 'rain', condition: 'Moderate rain' },
  65: { conditionCode: 'extreme-rain', condition: 'Heavy rain' },
  66: { conditionCode: 'sleet', condition: 'Freezing rain' },
  67: { conditionCode: 'sleet', condition: 'Heavy freezing rain' },
  71: { conditionCode: 'snow', condition: 'Slight snow' },
  73: { conditionCode: 'snow', condition: 'Moderate snow' },
  75: { conditionCode: 'extreme-snow', condition: 'Heavy snow' },
  77: { conditionCode: 'snow', condition: 'Snow grains' },
  80: { conditionCode: 'rain', condition: 'Slight rain showers' },
  81: { conditionCode: 'rain', condition: 'Moderate rain showers' },
  82: { conditionCode: 'extreme-rain', condition: 'Violent rain showers' },
  85: { conditionCode: 'snow', condition: 'Slight snow showers' },
  86: { conditionCode: 'extreme-snow', condition: 'Heavy snow showers' },
  95: { conditionCode: 'thunderstorm', condition: 'Thunderstorm' },
  96: { conditionCode: 'thunderstorm', condition: 'Thunderstorm with slight hail' },
  99: { conditionCode: 'thunderstorm', condition: 'Thunderstorm with heavy hail' },
}

export interface WeatherData {
  city: string
  country: string
  temperature: string
  condition: string
  conditionCode: string
  isNight: boolean
  feelsLike: string
  humidity: string
  wind: string
  precipitation: string
  high?: string
  low?: string
}

export function mapWmoCode(code: number, isNight: boolean): { conditionCode: string, condition: string } {
  const mapped = wmoCodeToCondition[code] ?? { conditionCode: 'clear-day', condition: 'Unknown' }

  if (isNight) {
    const nightVariants: Record<string, string> = {
      'clear-day': 'clear-night',
      'partly-cloudy-day': 'partly-cloudy-night',
    }
    return {
      ...mapped,
      conditionCode: nightVariants[mapped.conditionCode] ?? mapped.conditionCode,
    }
  }

  return mapped
}

// 外部网络调用统一超时：open-meteo 若挂起，无 signal 的 fetch 会让整个 agent
// 回合无限期卡住（与截屏 getSources 无超时同类的"话没说完就停"）。
const WEATHER_FETCH_TIMEOUT_MS = 10_000

interface WeatherFetchOptions {
  /** 单次请求超时（毫秒）。测试注入用，生产默认 10s。 */
  timeoutMs?: number
  /** 注入 fetch 实现（测试用）。 */
  fetchImpl?: typeof fetch
}

/** 把 abort/超时错误翻译成可诊断的中文提示，其余错误原样上抛。 */
function asWeatherNetworkError(error: unknown, label: string): never {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    throw new Error(`${label}超时（${WEATHER_FETCH_TIMEOUT_MS}ms）：open-meteo 未响应。请重试。`)
  throw error
}

export async function geocodeCity(city: string, options: WeatherFetchOptions = {}): Promise<{ name: string, latitude: number, longitude: number, country: string }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  let res: Response
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs ?? WEATHER_FETCH_TIMEOUT_MS) })
  }
  catch (error) {
    asWeatherNetworkError(error, '地理编码')
  }

  if (!res.ok)
    throw new Error(`Geocoding request failed: ${res.status}`)

  const data: GeocodingResult = await res.json()

  if (!data.results?.length)
    throw new Error(`City not found: "${city}"`)

  const result = data.results[0]
  return { name: result.name, latitude: result.latitude, longitude: result.longitude, country: result.country }
}

export async function fetchWeather(city: string, options: WeatherFetchOptions = {}): Promise<WeatherData> {
  const fetchImpl = options.fetchImpl ?? fetch
  const geo = await geocodeCity(city, options)

  const params = new URLSearchParams({
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    forecast_days: '1',
  })

  const res = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(options.timeoutMs ?? WEATHER_FETCH_TIMEOUT_MS) })

  if (!res.ok)
    throw new Error(`Weather request failed: ${res.status}`)

  const data: OpenMeteoWeather = await res.json()
  const current = data.current
  const isNight = current.is_day === 0
  const { conditionCode, condition } = mapWmoCode(current.weather_code, isNight)

  return {
    city: geo.name,
    country: geo.country,
    temperature: `${Math.round(current.temperature_2m)}°C`,
    condition,
    conditionCode,
    isNight,
    feelsLike: `${Math.round(current.apparent_temperature)}°C`,
    humidity: `${current.relative_humidity_2m}%`,
    wind: `${Math.round(current.wind_speed_10m)} km/h`,
    precipitation: `${current.precipitation} mm`,
    high: data.daily ? `${Math.round(data.daily.temperature_2m_max[0])}°C` : undefined,
    low: data.daily ? `${Math.round(data.daily.temperature_2m_min[0])}°C` : undefined,
  }
}
