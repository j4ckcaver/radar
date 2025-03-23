
// Hedef nokta tipi
export interface TargetPlace {
  id: number;
  title: string;
  description: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
}

// Konumla ilgili tip tanımları
export interface Coordinates {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface LocationObject {
  coords: Coordinates;
  timestamp: number;
}

export interface LocationData {
  locations: LocationObject[];
}

// Uygulama durumu için tip tanımı
export interface AppState {
  location: LocationObject | null;
  errorMsg: string | null;
  markers: TargetPlace[];
  tracking: boolean;
  targetPlaces: TargetPlace[];
}

// Notification tipleri
export interface NotificationContent {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// TaskManager tipleri
export interface TaskManagerError {
  message: string;
  code?: string;
}

export interface TaskManagerData {
  data?: LocationData;
  error?: TaskManagerError;
}

// Arka plan konum servisi seçenekleri
export interface BackgroundLocationOptions {
  accuracy: number;
  timeInterval: number;
  distanceInterval: number;
  foregroundService?: {
    notificationTitle: string;
    notificationBody: string;
  };
  pausesUpdatesAutomatically?: boolean;
  showsBackgroundLocationIndicator?: boolean;
  activityType?: number;
  deferredUpdatesInterval?: number;
  deferredUpdatesDistance?: number;
}
