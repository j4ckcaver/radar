export interface TargetLocation {
  id: string;
  title: string;
  description?: string;
  icon?: string; // İkon adı
  coordinate: {
    latitude: number;
    longitude: number;
  };
  radius: number; // Bildirim mesafesi (metre)
  createdAt: Date;
  alertEnabled: boolean;
}

export interface LocationState {
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null;
  tracking: boolean;
  lastUpdated: Date | null;
  error: string | null;
}
