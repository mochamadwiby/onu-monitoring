// Global variables
let map;
let onuMarkers = [];
let odbMarkers = [];
let antLines = [];
let currentFilters = {};
let statusVisibility = {
  online: true,
  los: true,
  powerFail: true,
  offline: true
};
let showAntlines = true;
let autoRefreshInterval;
let apiConfigured = false;

// API Base URL
const API_BASE = '/api';

// Initialize application
document.addEventListener('DOMContentLoaded', function () {
  initializeMap();
  initializeEventListeners();
  loadOLTsList();
  loadOnuData();
  startAutoRefresh();
});

// Initialize Leaflet map
function initializeMap() {
  map = L.map('map').setView([-7.5489, 110.8277], 13); // Default to Jombang coordinates

  // Add OpenStreetMap tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // Add scale control
  L.control.scale().addTo(map);
}

// Initialize event listeners
function initializeEventListeners() {
  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadOnuData();
  });

  // Apply filters button
  document.getElementById('applyFiltersBtn').addEventListener('click', () => {
    applyFilters();
  });

  // Status visibility checkboxes
  document.getElementById('showOnline').addEventListener('change', (e) => {
    statusVisibility.online = e.target.checked;
    filterMarkers();
  });

  document.getElementById('showLOS').addEventListener('change', (e) => {
    statusVisibility.los = e.target.checked;
    filterMarkers();
  });

  document.getElementById('showPowerFail').addEventListener('change', (e) => {
    statusVisibility.powerFail = e.target.checked;
    filterMarkers();
  });

  document.getElementById('showOffline').addEventListener('change', (e) => {
    statusVisibility.offline = e.target.checked;
    filterMarkers();
  });

  document.getElementById('showAntlines').addEventListener('change', (e) => {
    showAntlines = e.target.checked;
    toggleAntlines();
  });
  testApiConnection();
}

// Load OLTs list for filter
async function loadOLTsList() {
  try {
    const response = await fetch(`${API_BASE}/olts`);
    const data = await response.json();

    if (data.status && data.response) {
      const oltFilter = document.getElementById('oltFilter');
      data.response.forEach(olt => {
        const option = document.createElement('option');
        option.value = olt.id;
        option.textContent = `${olt.name} (${olt.ip})`;
        oltFilter.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading OLTs:', error);
    showNotification('Failed to load OLTs list', 'error');
  }
}

// Apply filters
function applyFilters() {
  currentFilters = {};

  const oltId = document.getElementById('oltFilter').value;
  const board = document.getElementById('boardFilter').value;
  const port = document.getElementById('portFilter').value;
  const zone = document.getElementById('zoneFilter').value;

  if (oltId) currentFilters.olt_id = oltId;
  if (board) currentFilters.board = board;
  if (port) currentFilters.port = port;
  if (zone) currentFilters.zone = zone;

  loadOnuData();
}

// Load ONU data from API
async function loadOnuData() {
  showLoading(true);

  try {
    // Build query string
    const queryParams = new URLSearchParams(currentFilters).toString();
    const url = `${API_BASE}/onus/gps${queryParams ? '?' + queryParams : ''}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.status) {
      throw new Error(data.error || 'Failed to load ONU data');
    }

    // Clear existing markers
    clearMarkers();

    // Process ONU data
    const onus = data.data || [];

    if (onus.length === 0) {
      showNotification('No ONUs found with current filters', 'info');
      updateStatistics({ online: 0, los: 0, powerFail: 0, offline: 0 });
      showLoading(false);
      return;
    }

    // Group ONUs by ODB for antlines
    const odbGroups = groupOnusByOdb(onus);

    // Add markers and antlines
    addOnuMarkers(onus);
    addOdbMarkersAndAntlines(odbGroups);

    // Update statistics
    updateStatistics(calculateStatistics(onus));

    // Load status history
    loadStatusHistory();

    // Fit map to markers
    if (onuMarkers.length > 0) {
      const group = new L.featureGroup(onuMarkers.map(m => m.marker));
      map.fitBounds(group.getBounds().pad(0.1));
    }

    showNotification('ONU data loaded successfully', 'success');

  } catch (error) {
    console.error('Error loading ONU data:', error);
    showNotification(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// Group ONUs by ODB
function groupOnusByOdb(onus) {
  const groups = {};

  onus.forEach(onu => {
    const odbName = onu.odb_name || 'Unknown';

    if (!groups[odbName]) {
      groups[odbName] = {
        odbName: odbName,
        odb_name: odbName,
        onus: [],
        avgLat: 0,
        avgLng: 0
      };
    }

    groups[odbName].onus.push(onu);
  });

  // Calculate average coordinates for each ODB
  Object.values(groups).forEach(group => {
    const validOnus = group.onus.filter(onu =>
      onu.latitude && onu.longitude &&
      !isNaN(parseFloat(onu.latitude)) &&
      !isNaN(parseFloat(onu.longitude))
    );

    if (validOnus.length > 0) {
      group.avgLat = validOnus.reduce((sum, onu) => sum + parseFloat(onu.latitude), 0) / validOnus.length;
      group.avgLng = validOnus.reduce((sum, onu) => sum + parseFloat(onu.longitude), 0) / validOnus.length;
    }
  });

  return groups;
}

// Add ONU markers to map
function addOnuMarkers(onus) {
  onus.forEach(onu => {
    if (!onu.latitude || !onu.longitude || isNaN(onu.latitude) || isNaN(onu.longitude)) {
      return;
    }

    const lat = parseFloat(onu.latitude);
    const lng = parseFloat(onu.longitude);

    // Create custom icon
    const iconHtml = `<div class="onu-marker ${getStatusClass(onu.status)}"></div>`;
    const icon = L.divIcon({
      html: iconHtml,
      className: 'custom-marker',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -10]
    });

    // Create marker
    const marker = L.marker([lat, lng], { icon: icon });

    // Create popup content
    const popupContent = createOnuPopup(onu);
    marker.bindPopup(popupContent);

    // Add click event
    marker.on('click', () => {
      // Optional: Load detailed info on click
    });

    marker.addTo(map);

    onuMarkers.push({
      marker: marker,
      onu: onu,
      status: onu.status
    });
  });

  filterMarkers();
}

// Add ODB markers and antlines
function addOdbMarkersAndAntlines(odbGroups) {
  // Convert object to array if needed
  const groups = Array.isArray(odbGroups) ? odbGroups : Object.values(odbGroups);

  groups.forEach(group => {
    if (!group.onus || group.onus.length === 0 || !group.avgLat || !group.avgLng) {
      return;
    }

    // Create ODB marker
    const odbIconHtml = `<div class="odb-marker">ODB</div>`;
    const odbIcon = L.divIcon({
      html: odbIconHtml,
      className: 'custom-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });

    const odbMarker = L.marker([group.avgLat, group.avgLng], { icon: odbIcon });

    const odbPopupContent = `
            <div class="popup-header">
                <i class="fas fa-project-diagram"></i> ${group.odbName || group.odb_name}
            </div>
            <div class="popup-info">
                <div class="popup-info-row">
                    <span class="popup-info-label">Total ONUs:</span>
                    <span class="popup-info-value">${group.onus.length}</span>
                </div>
            </div>
        `;

    odbMarker.bindPopup(odbPopupContent);
    odbMarker.addTo(map);

    odbMarkers.push(odbMarker);

    // Create antlines from ODB to each ONU
    group.onus.forEach(onu => {
      if (!onu.latitude || !onu.longitude) return;

      const lat = parseFloat(onu.latitude);
      const lng = parseFloat(onu.longitude);

      // Validate coordinates
      if (isNaN(lat) || isNaN(lng)) return;

      // Color based on status
      let color;
      switch (onu.status) {
        case 'Online':
          color = '#28a745';
          break;
        case 'LOS':
          color = '#dc3545';
          break;
        case 'Power Fail':
          color = '#ffc107';
          break;
        default:
          color = '#6c757d';
      }

      // Create antline
      const antLine = L.polyline.antPath(
        [[group.avgLat, group.avgLng], [lat, lng]],
        {
          color: color,
          weight: 2,
          opacity: 0.6,
          delay: 1000,
          dashArray: [10, 20],
          pulseColor: '#fff'
        }
      );

      antLine.addTo(map);
      antLines.push(antLine);
    });
  });

  if (!showAntlines) {
    toggleAntlines();
  }
}

// Create ONU popup content
function createOnuPopup(onu) {
  return `
        <div class="popup-header">
            <i class="fas fa-wifi"></i> ${onu.name || onu.unique_external_id}
        </div>
        <div class="popup-info">
            <div class="popup-info-row">
                <span class="popup-info-label">Status:</span>
                <span class="popup-status ${getStatusClass(onu.status)}">${onu.status}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">ODB:</span>
                <span class="popup-info-value">${onu.odb_name || 'N/A'}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">OLT:</span>
                <span class="popup-info-value">${onu.olt_name || 'N/A'}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">PON:</span>
                <span class="popup-info-value">${onu.board}/${onu.port}/${onu.onu}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">Type:</span>
                <span class="popup-info-value">${onu.onu_type_name || 'N/A'}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">Zone:</span>
                <span class="popup-info-value">${onu.zone_name || 'N/A'}</span>
            </div>
            ${onu.address ? `
            <div class="popup-info-row">
                <span class="popup-info-label">Address:</span>
                <span class="popup-info-value">${onu.address}</span>
            </div>
            ` : ''}
        </div>
        <div class="popup-actions">
            <button class="btn-popup btn-popup-primary" onclick="showOnuDetails('${onu.unique_external_id}')">
                <i class="fas fa-info-circle"></i> View Details
            </button>
        </div>
    `;
}

// Show ONU details in modal
async function showOnuDetails(externalId) {
  const modal = new bootstrap.Modal(document.getElementById('onuDetailModal'));
  const content = document.getElementById('onuDetailContent');

  content.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    `;

  modal.show();

  try {
    const response = await fetch(`${API_BASE}/onus/${externalId}`);
    const data = await response.json();

    if (!data.status) {
      throw new Error(data.error || 'Failed to load ONU details');
    }

    const onu = data.data;
    content.innerHTML = createOnuDetailContent(onu);

  } catch (error) {
    console.error('Error loading ONU details:', error);
    content.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> ${error.message}
            </div>
        `;
  }
}

// Create detailed ONU content
function createOnuDetailContent(onu) {
  return `
        <div class="detail-section">
            <div class="detail-section-title">
                <i class="fas fa-info-circle"></i> Basic Information
            </div>
            <div class="detail-row">
                <span class="detail-label">External ID:</span>
                <span class="detail-value">${onu.unique_external_id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value">${onu.name || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Serial Number:</span>
                <span class="detail-value">${onu.sn || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">
                    <span class="popup-status ${getStatusClass(onu.status)}">${onu.status}</span>
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Admin Status:</span>
                <span class="detail-value">${onu.administrative_status || 'N/A'}</span>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">
                <i class="fas fa-network-wired"></i> Network Information
            </div>
            <div class="detail-row">
                <span class="detail-label">OLT:</span>
                <span class="detail-value">${onu.olt_name || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Board/Port/ONU:</span>
                <span class="detail-value">${onu.board}/${onu.port}/${onu.onu}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">ONU Type:</span>
                <span class="detail-value">${onu.onu_type_name || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">ODB:</span>
                <span class="detail-value">${onu.odb_name || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Zone:</span>
                <span class="detail-value">${onu.zone_name || 'N/A'}</span>
            </div>
        </div>

        ${onu.signal ? `
        <div class="detail-section">
            <div class="detail-section-title">
                <i class="fas fa-signal"></i> Signal Information
            </div>
            <div class="detail-row">
                <span class="detail-label">Signal Quality:</span>
                <span class="detail-value">${onu.signal.onu_signal || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Signal Value:</span>
                <span class="detail-value">${onu.signal.onu_signal_value || 'N/A'}</span>
            </div>
            ${onu.signal.onu_signal_1310 ? `
            <div class="detail-row">
                <span class="detail-label">1310nm:</span>
                <span class="detail-value">${onu.signal.onu_signal_1310}</span>
            </div>
            ` : ''}
            ${onu.signal.onu_signal_1490 ? `
            <div class="detail-row">
                <span class="detail-label">1490nm:</span>
                <span class="detail-value">${onu.signal.onu_signal_1490}</span>
            </div>
            ` : ''}
        </div>
        ` : ''}

        ${onu.service_ports && onu.service_ports.length > 0 ? `
        <div class="detail-section">
            <div class="detail-section-title">
                <i class="fas fa-ethernet"></i> Service Ports
            </div>
            ${onu.service_ports.map(port => `
                <div class="detail-row">
                    <span class="detail-label">Port ${port.service_port}:</span>
                    <span class="detail-value">VLAN ${port.vlan} - ↑${port.upload_speed} / ↓${port.download_speed}</span>
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${onu.address ? `
        <div class="detail-section">
            <div class="detail-section-title">
                <i class="fas fa-map-marker-alt"></i> Location
            </div>
            <div class="detail-row">
                <span class="detail-label">Address:</span>
                <span class="detail-value">${onu.address}</span>
            </div>
        </div>
        ` : ''}
    `;
}

// Load status history
async function loadStatusHistory() {
  try {
    const response = await fetch(`${API_BASE}/history`);
    const data = await response.json();

    if (!data.status) {
      throw new Error(data.error || 'Failed to load status history');
    }

    const history = data.data;

    // Update LOS events
    updateEventList('recentLosContent', 'losEventCount', history.recent_los, 'los');

    // Update Power Fail events
    updateEventList('recentPowerFailContent', 'powerFailEventCount', history.recent_power_fail, 'power-fail');

  } catch (error) {
    console.error('Error loading status history:', error);
  }
}

// Update event list in footer
function updateEventList(contentId, countId, events, type) {
  const content = document.getElementById(contentId);
  const countBadge = document.getElementById(countId);

  countBadge.textContent = events.length;

  if (events.length === 0) {
    content.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="fas fa-inbox fa-2x mb-2"></i>
                <p>No recent ${type === 'los' ? 'LOS' : 'power fail'} events</p>
            </div>
        `;
    return;
  }

  content.innerHTML = events.map(event => {
    const timeAgo = getTimeAgo(new Date(event.timestamp));
    return `
            <div class="event-card ${type}" onclick="focusOnOnu('${event.unique_external_id}')">
                <div class="event-card-header">
                    <div class="event-card-title">
                        <i class="fas fa-wifi"></i> ${event.name}
                    </div>
                    <div class="event-card-time">
                        <i class="far fa-clock"></i> ${timeAgo}
                    </div>
                </div>
                <div class="event-card-info">
                    <span class="event-card-badge bg-secondary text-white">
                        ${event.odb_name}
                    </span>
                    <span class="event-card-badge bg-light text-dark">
                        PON: ${event.board}/${event.port}/${event.onu}
                    </span>
                    <br>
                    <small class="text-muted">
                        ${event.old_status} → ${event.new_status}
                    </small>
                </div>
            </div>
        `;
  }).join('');
}

// Focus map on specific ONU
function focusOnOnu(externalId) {
  const markerData = onuMarkers.find(m => m.onu.unique_external_id === externalId);

  if (markerData) {
    const marker = markerData.marker;
    map.setView(marker.getLatLng(), 16);
    marker.openPopup();
  }
}

// Calculate statistics
function calculateStatistics(onus) {
  const stats = {
    online: 0,
    los: 0,
    powerFail: 0,
    offline: 0
  };

  onus.forEach(onu => {
    switch (onu.status) {
      case 'Online':
        stats.online++;
        break;
      case 'LOS':
        stats.los++;
        break;
      case 'Power Fail':
        stats.powerFail++;
        break;
      case 'Offline':
        stats.offline++;
        break;
    }
  });

  return stats;
}

// Update statistics in navbar
function updateStatistics(stats) {
  document.getElementById('onlineCount').textContent = `${stats.online} Online`;
  document.getElementById('losCount').textContent = `${stats.los} LOS`;
  document.getElementById('powerFailCount').textContent = `${stats.powerFail} Power Fail`;
  document.getElementById('offlineCount').textContent = `${stats.offline} Offline`;
}

// Filter markers based on status visibility
function filterMarkers() {
  onuMarkers.forEach(markerData => {
    const shouldShow = shouldShowMarker(markerData.status);

    if (shouldShow) {
      markerData.marker.addTo(map);
    } else {
      map.removeLayer(markerData.marker);
    }
  });
}

// Check if marker should be shown based on filters
function shouldShowMarker(status) {
  switch (status) {
    case 'Online':
      return statusVisibility.online;
    case 'LOS':
      return statusVisibility.los;
    case 'Power Fail':
      return statusVisibility.powerFail;
    case 'Offline':
      return statusVisibility.offline;
    default:
      return true;
  }
}

// Toggle antlines visibility
function toggleAntlines() {
  antLines.forEach(line => {
    if (showAntlines) {
      line.addTo(map);
    } else {
      map.removeLayer(line);
    }
  });

  odbMarkers.forEach(marker => {
    if (showAntlines) {
      marker.addTo(map);
    } else {
      map.removeLayer(marker);
    }
  });
}

// Clear all markers
function clearMarkers() {
  onuMarkers.forEach(m => map.removeLayer(m.marker));
  odbMarkers.forEach(m => map.removeLayer(m));
  antLines.forEach(l => map.removeLayer(l));

  onuMarkers = [];
  odbMarkers = [];
  antLines = [];
}

// Get status CSS class
function getStatusClass(status) {
  const classMap = {
    'Online': 'online',
    'LOS': 'los',
    'Power Fail': 'power-fail',
    'Offline': 'offline'
  };
  return classMap[status] || 'offline';
}

// Show/hide loading overlay
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (show) {
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
  }
}

// Show notification toast
function showNotification(message, type = 'info') {
  const toast = document.getElementById('notificationToast');
  const toastMessage = document.getElementById('toastMessage');

  toastMessage.textContent = message;

  // Change toast style based on type
  toast.className = 'toast';
  if (type === 'error') {
    toast.classList.add('bg-danger', 'text-white');
  } else if (type === 'success') {
    toast.classList.add('bg-success', 'text-white');
  } else {
    toast.classList.add('bg-info', 'text-white');
  }

  const bsToast = new bootstrap.Toast(toast);
  bsToast.show();
}

// Get time ago string
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';

  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';

  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';

  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';

  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';

  return Math.floor(seconds) + ' seconds ago';
}

// Auto refresh
function startAutoRefresh() {
  // Refresh every 5 minutes
  autoRefreshInterval = setInterval(() => {
    console.log('Auto-refreshing ONU data...');
    loadOnuData();
  }, 5 * 60 * 1000);
}

// Stop auto refresh
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
}

// ... existing code ...

// Group ONUs by ODB
function groupOnusByOdb(onus) {
  const groups = {};

  onus.forEach(onu => {
    // Skip if no ODB name or coordinates
    if (!onu.odb_name || onu.odb_name === '' || onu.odb_name === 'Unknown ODB') {
      return;
    }

    const odbName = onu.odb_name;

    if (!groups[odbName]) {
      groups[odbName] = {
        odbName: odbName,
        onus: [],
        avgLat: 0,
        avgLng: 0
      };
    }

    groups[odbName].onus.push(onu);
  });

  // Calculate average coordinates for each ODB
  Object.values(groups).forEach(group => {
    const validOnus = group.onus.filter(onu =>
      onu.latitude && onu.longitude &&
      !isNaN(onu.latitude) && !isNaN(onu.longitude)
    );

    if (validOnus.length > 0) {
      group.avgLat = validOnus.reduce((sum, onu) => sum + parseFloat(onu.latitude), 0) / validOnus.length;
      group.avgLng = validOnus.reduce((sum, onu) => sum + parseFloat(onu.longitude), 0) / validOnus.length;
    }
  });

  // Filter out groups with no valid coordinates
  return Object.values(groups).filter(group => group.avgLat !== 0 && group.avgLng !== 0);
}

// Add ONU markers to map
function addOnuMarkers(onus) {
  onus.forEach(onu => {
    if (!onu.latitude || !onu.longitude || isNaN(onu.latitude) || isNaN(onu.longitude)) {
      console.warn(`ONU ${onu.unique_external_id} has invalid coordinates`);
      return;
    }

    const lat = parseFloat(onu.latitude);
    const lng = parseFloat(onu.longitude);

    // Skip invalid coordinates
    if (lat === 0 && lng === 0) {
      console.warn(`ONU ${onu.unique_external_id} has zero coordinates`);
      return;
    }

    // Create custom icon
    const iconHtml = `<div class="onu-marker ${getStatusClass(onu.status)}"></div>`;
    const icon = L.divIcon({
      html: iconHtml,
      className: 'custom-marker',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -10]
    });

    // Create marker
    const marker = L.marker([lat, lng], { icon: icon });

    // Create popup content
    const popupContent = createOnuPopup(onu);
    marker.bindPopup(popupContent);

    marker.addTo(map);

    onuMarkers.push({
      marker: marker,
      onu: onu,
      status: onu.status
    });
  });

  filterMarkers();
}

// Create ONU popup content
function createOnuPopup(onu) {
  return `
        <div class="popup-header">
            <i class="fas fa-wifi"></i> ${onu.name || onu.unique_external_id}
        </div>
        <div class="popup-info">
            <div class="popup-info-row">
                <span class="popup-info-label">Status:</span>
                <span class="popup-status ${getStatusClass(onu.status)}">${onu.status}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">Signal:</span>
                <span class="popup-info-value">${onu.signal || 'N/A'}</span>
            </div>
            ${onu.signal_1310 ? `
            <div class="popup-info-row">
                <span class="popup-info-label">Signal 1310:</span>
                <span class="popup-info-value">${onu.signal_1310} dBm</span>
            </div>
            ` : ''}
            ${onu.signal_1490 ? `
            <div class="popup-info-row">
                <span class="popup-info-label">Signal 1490:</span>
                <span class="popup-info-value">${onu.signal_1490} dBm</span>
            </div>
            ` : ''}
            <div class="popup-info-row">
                <span class="popup-info-label">ODB:</span>
                <span class="popup-info-value">${onu.odb_name || 'N/A'}</span>
            </div>
            ${onu.odb_port ? `
            <div class="popup-info-row">
                <span class="popup-info-label">ODB Port:</span>
                <span class="popup-info-value">${onu.odb_port}</span>
            </div>
            ` : ''}
            <div class="popup-info-row">
                <span class="popup-info-label">OLT:</span>
                <span class="popup-info-value">${onu.olt_name || 'N/A'}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">PON:</span>
                <span class="popup-info-value">${onu.board || 'N/A'}/${onu.port || 'N/A'}/${onu.onu || 'N/A'}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">Type:</span>
                <span class="popup-info-value">${onu.onu_type_name || 'N/A'}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">Zone:</span>
                <span class="popup-info-value">${onu.zone_name || 'N/A'}</span>
            </div>
            <div class="popup-info-row">
                <span class="popup-info-label">SN:</span>
                <span class="popup-info-value"><small>${onu.sn || 'N/A'}</small></span>
            </div>
        </div>
        <div class="popup-actions">
            <button class="btn-popup btn-popup-primary" onclick="showOnuDetails('${onu.unique_external_id}')">
                <i class="fas fa-info-circle"></i> View Full Details
            </button>
        </div>
    `;
}

// Tambahkan fungsi-fungsi baru
async function testApiConnection() {
  try {
    const response = await fetch(`${API_BASE}/test-connection`);
    const data = await response.json();

    if (data.status) {
      apiConfigured = true;
      showApiStatusBanner('success', 'API Connected', 'Connection to SmartOLT API successful');
      setTimeout(() => closeApiStatusBanner(), 5000);
    } else {
      apiConfigured = false;
      showApiStatusBanner('danger', 'API Connection Failed', data.error);
      showConfigDebug(data.config);
    }
  } catch (error) {
    apiConfigured = false;
    showApiStatusBanner('danger', 'API Connection Error', error.message);
    console.error('API connection test failed:', error);
  }
}

async function showConfigDebug(config) {
  console.group('🔧 API Configuration Debug');
  console.log('Base URL:', config?.baseUrl || 'Not set');
  console.log('API Key Configured:', config?.apiKeySet || false);
  console.log('API Key Prefix:', config?.apiKeyPrefix || 'NOT SET');
  console.groupEnd();

  // Try to get more debug info
  try {
    const response = await fetch(`${API_BASE}/debug/config`);
    const debugData = await response.json();

    if (debugData.status) {
      console.group('📊 Full Configuration');
      console.table(debugData.config);
      console.groupEnd();
    }
  } catch (error) {
    console.error('Could not fetch debug config:', error);
  }
}

function showApiStatusBanner(type, title, message) {
  const banner = document.getElementById('apiStatusBanner');
  const icon = document.getElementById('apiStatusIcon');
  const titleEl = document.getElementById('apiStatusTitle');
  const messageEl = document.getElementById('apiStatusMessage');

  // Set content
  titleEl.textContent = title;
  messageEl.textContent = message;

  // Set style
  banner.className = `alert alert-${type} alert-dismissible fade show`;
  banner.style.display = 'block';

  // Set icon
  if (type === 'success') {
    icon.className = 'fas fa-check-circle me-2';
  } else if (type === 'danger') {
    icon.className = 'fas fa-exclamation-triangle me-2';
  } else {
    icon.className = 'fas fa-info-circle me-2';
  }
}

function closeApiStatusBanner() {
  const banner = document.getElementById('apiStatusBanner');
  banner.style.display = 'none';
}

// Update loadOnuData untuk cek API configuration dulu
async function loadOnuData() {
  if (!apiConfigured) {
    showNotification('API not configured. Please check your API key.', 'error');
    showApiStatusBanner('warning', 'Configuration Required',
      'Please configure your API_KEY in the .env file and restart the server.');
    return;
  }

  showLoading(true);

  try {
    // Build query string
    const queryParams = new URLSearchParams(currentFilters).toString();
    const url = `${API_BASE}/onus/gps${queryParams ? '?' + queryParams : ''}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.status) {
      // Enhanced error handling
      let errorMessage = data.error || 'Failed to load ONU data';

      if (errorMessage.includes('403')) {
        errorMessage = '403 Forbidden: Please check your API key configuration.\n' +
          'Go to server console for detailed instructions.';
        showApiStatusBanner('danger', 'Access Denied', errorMessage);
      } else if (errorMessage.includes('401')) {
        errorMessage = '401 Unauthorized: Invalid API key.\n' +
          'Please verify your API_KEY in .env file.';
        showApiStatusBanner('danger', 'Authentication Failed', errorMessage);
      }

      throw new Error(errorMessage);
    }

    // Clear existing markers
    clearMarkers();

    // Process ONU data
    const onus = data.data || [];

    if (onus.length === 0) {
      showNotification('No ONUs found with current filters', 'info');
      updateStatistics({ online: 0, los: 0, powerFail: 0, offline: 0 });
      showLoading(false);
      return;
    }

    // Group ONUs by ODB for antlines
    const odbGroups = groupOnusByOdb(onus);

    // Add markers and antlines
    addOnuMarkers(onus);
    addOdbMarkersAndAntlines(odbGroups);

    // Update statistics
    updateStatistics(calculateStatistics(onus));

    // Load status history
    loadStatusHistory();

    // Fit map to markers
    if (onuMarkers.length > 0) {
      const group = new L.featureGroup(onuMarkers.map(m => m.marker));
      map.fitBounds(group.getBounds().pad(0.1));
    }

    showNotification('ONU data loaded successfully', 'success');

  } catch (error) {
    console.error('Error loading ONU data:', error);
    showNotification(error.message, 'error');

    // Show detailed error in console
    console.group('❌ Error Details');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.groupEnd();
  } finally {
    showLoading(false);
  }
}