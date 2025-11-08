# ONU Monitoring System

[![CI](https://github.com/mochamadwiby/onu-monitoring/workflows/CI/badge.svg)](https://github.com/mochamadwiby/onu-monitoring/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![npm version](https://img.shields.io/npm/v/npm.svg)](https://www.npmjs.com/)

Aplikasi web monitoring untuk menampilkan koordinat ONU di peta dengan visualisasi status real-time menggunakan Leaflet Maps dan SmartOLT API.

## Fitur

- **Peta Interaktif**: Visualisasi lokasi ONU menggunakan Leaflet dengan marker berwarna berdasarkan status
- **Status Real-time**:
  - Online (Hijau)
  - LOS - Kabel Putus (Merah dengan animasi pulse)
  - Power Fail - Kendala Listrik (Kuning dengan animasi blink)
  - Offline - Power fail lama (Abu-abu)
- **ODB Connections**: Antline animasi dari ODB ke setiap ONU
- **Event Tracking**: Footer dengan 2 kolom untuk Recently LOS dan Recently Power Fail
- **Filtering**: Filter berdasarkan OLT, Board, Port, Zone
- **Detail View**: Modal dengan informasi lengkap ONU termasuk signal strength
- **Auto Refresh**: Refresh otomatis setiap 5 menit
- **Rate Limiting**: Proteksi otomatis terhadap API limit

## Teknologi

- **Backend**: Node.js, Express
- **Frontend**: Vanilla JavaScript, Leaflet, Bootstrap 5
- **API**: SmartOLT REST API
- **Testing**: Jest
- **Caching**: Node-cache
- **Logging**: Winston

## Instalasi

```bash
# Clone repository
git clone <repository-url>
cd onu-monitoring

# Install dependencies
npm install

# Copy .env.example ke .env dan konfigurasi
cp .env.example .env

# Edit .env dengan konfigurasi API Anda
nano .env
```

## Konfigurasi

Edit file `.env`:

```env
# API Configuration
API_BASE_URL=https://dmt-jombang.smartolt.com/api
API_KEY=your_api_key_here
API_SUBDOMAIN=dmt-jombang

# Server Configuration
PORT=3000
NODE_ENV=development

# Cache Configuration (in seconds)
CACHE_TTL_ONU_DETAILS=3600
CACHE_TTL_ONU_STATUS=60
CACHE_TTL_GPS=3600

# Rate Limiting
API_DELAY=8000
GPS_API_LIMIT_PER_HOUR=3
DETAILS_API_LIMIT_PER_HOUR=3
```

## Menjalankan Aplikasi

```bash
# Development mode dengan auto-reload
npm run dev

# Production mode
npm start

# Run tests
npm test

# Run tests with watch mode
npm run test:watch
```

Aplikasi akan berjalan di `http://localhost:3000`

## API Endpoints

### Internal API

- `GET /api/onus` - Get all ONUs with details
- `GET /api/onus/gps` - Get ONUs with GPS coordinates
- `GET /api/onus/by-odb` - Get ONUs grouped by ODB
- `GET /api/onus/:externalId` - Get single ONU details
- `GET /api/history` - Get status change history
- `GET /api/olts` - Get OLTs list
- `GET /api/rate-limit-stats` - Get rate limiter statistics
- `GET /health` - Health check endpoint

### Query Parameters

Semua endpoint mendukung filtering:

- `olt_id` - Filter by OLT ID
- `board` - Filter by board number
- `port` - Filter by port number
- `zone` - Filter by zone name
- `odb` - Filter by ODB name

## Struktur Status ONU

### Status Types

1. **Online**: ONU berfungsi normal
2. **LOS (Loss of Signal)**: Kabel putus atau masalah optik
3. **Power Fail**: Kendala kelistrikan atau adaptor
4. **Offline**: Power fail dalam waktu lama

### Status Determination Logic

```
- API status "Online" → Online
- API status "LOS" → LOS
- API status "Power fail" → Power Fail
- API status "Offline" → Offline
- Power fail > threshold time → Offline
```

## Rate Limiting

Aplikasi mengimplementasikan rate limiting untuk melindungi API:

### Limits

- **GPS Endpoint**: Maksimal 3 calls per jam
- **Details Endpoint**: Maksimal 3 calls per jam
- **Other Endpoints**: Delay 8 detik antar request

### Caching Strategy

- ONU Details: Cache 1 jam
- ONU Status: Cache 1 menit
- GPS Coordinates: Cache 1 jam

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/services/onuService.test.js

# Watch mode
npm run test:watch
```

### Test Coverage

- API Service: Request handling, error handling, rate limiting
- ONU Service: Status determination, data processing, caching
- Rate Limiter: Call tracking, limit enforcement
- Utils: Logger, helpers

## Error Handling

Aplikasi mengimplementasikan comprehensive error handling:

1. **API Errors**: Logged dan di-handle dengan fallback
2. **Rate Limit Errors**: User notification dengan countdown
3. **Network Errors**: Retry mechanism dengan exponential backoff
4. **Cache Errors**: Graceful degradation
5. **Validation Errors**: Clear error messages

## Logging

Logs disimpan di:

- `logs/error.log` - Error logs only
- `logs/combined.log` - All logs

Log levels:

- `error` - Errors
- `warn` - Warnings
- `info` - Informational
- `debug` - Debug information (development only)

## Performance Optimization

1. **Caching**: Aggressive caching dengan TTL
2. **Rate Limiting**: Mencegah overload API
3. **Lazy Loading**: Load data on demand
4. **Compression**: Gzip compression untuk responses
5. **Debouncing**: Filter changes debounced

## Security

1. **Helmet.js**: Security headers
2. **CORS**: Configured CORS policy
3. **API Key**: Stored in environment variables
4. **Input Validation**: All inputs validated
5. **Rate Limiting**: Request throttling

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Troubleshooting

### API Key Invalid

```
Periksa .env file dan pastikan API_KEY benar
```

### Rate Limit Exceeded

```
Tunggu hingga rate limit reset (ditampilkan di UI)
Cache akan digunakan selama periode ini
```

### No ONUs Shown

```
1. Periksa filter settings
2. Verifikasi data ONU memiliki koordinat GPS
3. Check console untuk errors
```

### Map Not Loading

```
1. Periksa koneksi internet
2. Verifikasi Leaflet CDN accessible
3. Check browser console untuk errors
```

## Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## License

MIT License

## Support

Untuk bantuan dan pertanyaan:

- Email: <support@example.com>
- Documentation: /docs
- Issues: GitHub Issues
