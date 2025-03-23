import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ScrollView, Switch, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import MapView, { Marker, Circle, Polyline } from 'react-native-maps';
import { StatusBar } from 'expo-status-bar';

// Arka plan konum izleme görevi için sabit bir isim
const LOCATION_TRACKING = 'location-tracking';

// Bildirim ayarları
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Global değişkenler (task'lar içinde erişilebilir)
global.targetLocation = null;
global.triggerDistance = 100;
global.hasNotified = false;

// Arka planda çalışacak konum takip görevi tanımı
TaskManager.defineTask(LOCATION_TRACKING, async ({ data, error }) => {
  if (error) {
    console.error('Konum takibi hatası:', error);
    return;
  }
  
  if (data) {
    // Konum verisi
    const { locations } = data;
    const lat = locations[0].coords.latitude;
    const lng = locations[0].coords.longitude;
    
    // Hedef konum - global değişkenlerden al
    const targetLat = global.targetLocation?.latitude || 0;
    const targetLng = global.targetLocation?.longitude || 0;
    const triggerDistance = global.triggerDistance || 100; // metre cinsinden
    
    // İki nokta arası mesafeyi hesaplama (Haversine formülü)
    const distance = calculateDistance(
      lat,
      lng,
      targetLat,
      targetLng
    );
    
    console.log(`Arka plan: Konum güncellendi, hedefe uzaklık: ${distance} metre`);
    
    // Eğer belirtilen mesafeye yaklaştıysa ve daha önce bildirim gönderilmediyse
    if (distance <= triggerDistance && !global.hasNotified) {
      await sendNotification(`Hedefe yaklaştınız!`, `Hedeften ${Math.round(distance)} metre uzaktasınız.`);
      global.hasNotified = true;
    }
    
    // Eğer hedeften uzaklaştıysa bildirim durumunu sıfırla
    if (distance > triggerDistance * 1.5 && global.hasNotified) {
      global.hasNotified = false;
    }
  }
});

// İki nokta arası mesafeyi hesaplama (Haversine formülü)
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371e3; // Dünya yarıçapı (metre cinsinden)
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Metre cinsinden mesafe
}

// İki nokta arasındaki yönü hesapla (radyan cinsinden)
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  
  const startLat = toRad(lat1);
  const startLng = toRad(lon1);
  const destLat = toRad(lat2);
  const destLng = toRad(lon2);
  
  const y = Math.sin(destLng - startLng) * Math.cos(destLat);
  const x = Math.cos(startLat) * Math.sin(destLat) -
            Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);
  let brng = Math.atan2(y, x);
  brng = (brng + 2 * Math.PI) % (2 * Math.PI); // Normalize 0-2PI
  
  return brng;
}

// Belirli bir mesafede ve yönde yeni bir konum hesapla
function calculateNewPosition(lat, lng, bearing, distance) {
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  
  const R = 6371e3; // Dünya yarıçapı (metre)
  const δ = distance / R; // açısal mesafe
  
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);
  
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(bearing)
  );
  
  const λ2 = λ1 + Math.atan2(
    Math.sin(bearing) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );
  
  return {
    latitude: toDeg(φ2),
    longitude: toDeg(λ2)
  };
}

// Bildirim gönderme fonksiyonu
async function sendNotification(title, body) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: title,
      body: body,
      sound: true,
    },
    trigger: null, // hemen gönder
  });
}

export default function App() {
  // Durum değişkenleri
  const [realLocation, setRealLocation] = useState(null);
  const [simulatedLocation, setSimulatedLocation] = useState(null);
  const [targetLocation, setTargetLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [triggerDistance, setTriggerDistance] = useState(100); // Metre cinsinden
  const [isSimulationMode, setIsSimulationMode] = useState(true); // Varsayılan olarak simülasyon modu açık
  const [simulationSpeed, setSimulationSpeed] = useState(5); // Metre/saniye
  const [simPath, setSimPath] = useState([]);
  const [hasNotified, setHasNotified] = useState(false);
  
  const mapRef = useRef(null);
  const simulationInterval = useRef(null);
  
  // Kullanıcının gerçek veya simüle konumunu döndürür
  const location = isSimulationMode ? simulatedLocation : realLocation;

  // Konum izinlerini kontrol et ve başlangıç konumunu al
  useEffect(() => {
    (async () => {
      try {
        // Konum izinleri
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Konum izni reddedildi!');
          return;
        }
        
        // Arka plan konum izinleri 
        if (Platform.OS === 'android' && !isSimulationMode) {
          const backgroundStatus = await Location.requestBackgroundPermissionsAsync();
          if (backgroundStatus.status !== 'granted') {
            Alert.alert(
              'Arka Plan İzni Gerekli',
              'Uygulama kapalıyken bildirimleri alabilmek için arka plan konum izni gereklidir.',
              [{ text: 'Tamam' }]
            );
          }
        }
        
        // Şu anki konumu al
        let currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        const loc = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        };
        
        setRealLocation(loc);
        setSimulatedLocation(loc); // Başlangıçta simüle konum gerçek konumla aynı
        
        // Bildirim izinlerini al
        await registerForPushNotificationsAsync();
        
        // Şu anda takip aktif mi kontrol et
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING)
          .catch(() => false);
        
        if (isTracking && !isSimulationMode) {
          setTrackingEnabled(true);
          
          // Eğer takip zaten aktifse, hedef konumu ve mesafeyi global değişkenlerden al
          if (global.targetLocation) {
            setTargetLocation(global.targetLocation);
            setTriggerDistance(global.triggerDistance);
          }
        }
      } catch (err) {
        setErrorMsg('Konum alınamadı: ' + err.message);
        console.error(err);
      }
    })();
    
    // Temizleme
    return () => {
      // Simülasyon intervalini temizle
      if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
      }
      
      // Gerçek takibi temizlemiyoruz ki arka planda çalışabilsin
    };
  }, [isSimulationMode]);

  // Konum takibini başlat
  const startTracking = async () => {
    if (!targetLocation) {
      Alert.alert('Hata', 'Önce bir hedef belirleyin!');
      return;
    }
    
    if (isSimulationMode) {
      startSimulation();
    } else {
      startRealTracking();
    }
  };
  
  // Gerçek konum takibini başlat
  const startRealTracking = async () => {
    try {
      // Global değişkenlere hedef konumu ve mesafeyi kaydet
      global.targetLocation = targetLocation;
      global.triggerDistance = triggerDistance;
      global.hasNotified = false;
      
      // Eğer takip zaten başladıysa, durdur ve yeniden başlat
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING)
        .catch(() => false);
      
      if (isTracking) {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING);
      }
      
      // Arka plan konum izlemeyi başlat
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000, // Her 10 saniyede bir güncelle (pil tasarrufu için)
        distanceInterval: 10, // 10 metreden fazla hareket edilirse güncelle
        foregroundService: {
          notificationTitle: 'Radar Takip Ediyor',
          notificationBody: 'Arka planda konum takibi aktif',
        },
        // Android için ek seçenekler
        android: {
          // Konum servisinin uygulamayı yeniden başlatmasına izin ver
          startForeground: true,
        }
      });
      
      setTrackingEnabled(true);
      Alert.alert(
        'Takip Başlatıldı', 
        'Hedef bölgeye yaklaştığınızda uygulama kapalı olsa bile bildirim alacaksınız.',
        [{ text: 'Tamam' }]
      );
    } catch (err) {
      console.error('Takip başlatılamadı:', err);
      Alert.alert('Hata', 'Konum takibi başlatılamadı: ' + err.message);
    }
  };

  // Simülasyonu başlat
  const startSimulation = () => {
    if (!simulatedLocation || !targetLocation) return;
    
    // Simülasyon yolunu temizle ve başlangıç konumunu ekle
    setSimPath([simulatedLocation]);
    setHasNotified(false);
    
    // Simüle edilmiş konum güncellemesi için bir interval oluştur
    simulationInterval.current = setInterval(() => {
      setSimulatedLocation((prevLoc) => {
        if (!prevLoc || !targetLocation) return prevLoc;
        
        // Hedefe olan mesafeyi hesapla
        const distance = calculateDistance(
          prevLoc.latitude,
          prevLoc.longitude,
          targetLocation.latitude,
          targetLocation.longitude
        );
        
        // Hedefe ulaşıldıysa simülasyonu durdur
        if (distance <= 5) { // 5 metreye kadar yaklaştıysa hedefi bulduk sayılır
          if (simulationInterval.current) {
            clearInterval(simulationInterval.current);
            simulationInterval.current = null;
            setTrackingEnabled(false);
          }
          return prevLoc;
        }
        
        // 1 saniyede ne kadar hareket edilecek (metre cinsinden)
        const moveDistance = simulationSpeed; // metre/saniye
        
        // Hedefe doğru yönü hesapla (radyan cinsinden)
        const bearing = calculateBearing(
          prevLoc.latitude,
          prevLoc.longitude,
          targetLocation.latitude,
          targetLocation.longitude
        );
        
        // Yeni konumu hesapla
        const newLocation = calculateNewPosition(
          prevLoc.latitude,
          prevLoc.longitude,
          bearing, 
          moveDistance
        );
        
        // Simülasyon yoluna yeni konumu ekle
        setSimPath(path => [...path, newLocation]);
        
        // Konuma göre bildirim kontrolü
        const newDistance = calculateDistance(
          newLocation.latitude,
          newLocation.longitude,
          targetLocation.latitude,
          targetLocation.longitude
        );
        
        // Belirtilen mesafeye yaklaştıysa ve daha önce bildirim gönderilmediyse
        if (newDistance <= triggerDistance && !hasNotified) {
          sendNotification(
            'Hedefe yaklaştınız!',
            `Hedeften ${Math.round(newDistance)} metre uzaktasınız.`
          );
          setHasNotified(true);
        }
        
        // Eğer hedeften uzaklaştıysa bildirim durumunu sıfırla
        if (newDistance > triggerDistance * 1.5 && hasNotified) {
          setHasNotified(false);
        }
        
        return newLocation;
      });
    }, 1000); // Her saniye güncelle
    
    setTrackingEnabled(true);
    Alert.alert('Bilgi', 'Simülasyon başlatıldı!');
  };

  // Takibi durdur
  const stopTracking = async () => {
    if (isSimulationMode) {
      // Simülasyon modunda
      if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
        simulationInterval.current = null;
      }
    } else {
      // Gerçek takip modunda
      try {
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING)
          .catch(() => false);
        
        if (isTracking) {
          await Location.stopLocationUpdatesAsync(LOCATION_TRACKING);
        }
      } catch (err) {
        console.error('Takip durdurulamadı:', err);
      }
    }
    
    setTrackingEnabled(false);
    setHasNotified(false);
    Alert.alert('Bilgi', `${isSimulationMode ? 'Simülasyon' : 'Takip'} durduruldu!`);
  };

  // Simülasyon modunu değiştir
  const toggleSimulationMode = () => {
    if (trackingEnabled) {
      stopTracking();
    }
    
    setSimPath([]); // Simülasyon yolunu temizle
    setIsSimulationMode(!isSimulationMode);
  };

  // Simülasyon hızını arttır
  const increaseSpeed = () => {
    if (simulationSpeed < 20) {
      setSimulationSpeed(prev => prev + 1);
    }
  };
  
  // Simülasyon hızını azalt
  const decreaseSpeed = () => {
    if (simulationSpeed > 1) {
      setSimulationSpeed(prev => prev - 1);
    }
  };

  // Haritada tıklama olayı - hedef nokta belirle
  const handleMapPress = (event) => {
    const pressedLocation = event.nativeEvent.coordinate;
    setTargetLocation(pressedLocation);
    setHasNotified(false);
    
    // Hedefi belirledikten sonra haritayı uygun şekilde yakınlaştır
    if (location && mapRef.current) {
      fitMapToMarkers(location, pressedLocation);
    }
  };
  
  // Haritada uzun basma - simüle konumu ayarla
  const handleLongPress = (event) => {
    if (isSimulationMode && !trackingEnabled) {
      const newLocation = event.nativeEvent.coordinate;
      setSimulatedLocation(newLocation);
      setSimPath([newLocation]);
      
      Alert.alert('Bilgi', 'Simüle edilmiş konum ayarlandı');
      
      // Haritayı yakınlaştır
      if (targetLocation && mapRef.current) {
        fitMapToMarkers(newLocation, targetLocation);
      }
    }
  };
  
  // Haritayı iki nokta arasına sığacak şekilde yakınlaştırma
  const fitMapToMarkers = (loc1, loc2) => {
    if (mapRef.current) {
      mapRef.current.fitToCoordinates(
        [loc1, loc2],
        {
          edgePadding: { top: 100, right: 100, bottom: 100, left: 100 },
          animated: true,
        }
      );
    }
  };
  
  // Mevcut hedefin mesafesini hesapla
  const getDistanceToTarget = () => {
    if (location && targetLocation) {
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        targetLocation.latitude,
        targetLocation.longitude
      );
      return Math.round(distance);
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <View style={styles.mapContainer}>
        {location ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
            onPress={handleMapPress}
            onLongPress={handleLongPress}
          >
            {/* Kullanıcı konumu */}
            <Marker
              coordinate={location}
              title={isSimulationMode ? "Simüle konum" : "Gerçek konum"}
              pinColor={isSimulationMode ? "green" : "blue"}
            />
            
            {/* Hedef konum */}
            {targetLocation && (
              <>
                <Marker
                  coordinate={targetLocation}
                  title="Hedef konum"
                  pinColor="red"
                />
                
                {/* Tetikleme mesafesi çemberi */}
                <Circle
                  center={targetLocation}
                  radius={triggerDistance}
                  strokeWidth={2}
                  strokeColor="rgba(255,0,0,0.5)"
                  fillColor="rgba(255,0,0,0.1)"
                />
              </>
            )}
            
            {/* Simülasyon modu yolu */}
            {isSimulationMode && simPath.length > 1 && (
              <Polyline
                coordinates={simPath}
                strokeWidth={3}
                strokeColor="rgba(0,100,0,0.7)"
              />
            )}
          </MapView>
        ) : (
          <Text style={styles.paragraph}>Konum alınıyor...</Text>
        )}
      </View>
      
      <ScrollView style={styles.controls}>
        {errorMsg ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : (
          <>
            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Simülasyon Modu:</Text>
              <Switch
                value={isSimulationMode}
                onValueChange={toggleSimulationMode}
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={isSimulationMode ? "#4a86f7" : "#f4f3f4"}
              />
            </View>
            
            {isSimulationMode && (
              <View style={styles.speedContainer}>
                <Text style={styles.speedLabel}>Simülasyon Hızı: {simulationSpeed} m/s</Text>
                <View style={styles.speedButtonContainer}>
                  <TouchableOpacity 
                    style={[styles.speedButton, styles.decreaseButton, simulationSpeed <= 1 && styles.disabledButton]}
                    onPress={decreaseSpeed}
                    disabled={simulationSpeed <= 1}
                  >
                    <Text style={styles.speedButtonText}>-</Text>
                  </TouchableOpacity>
                  
                  <View style={styles.speedValueContainer}>
                    <Text style={styles.speedValueText}>{simulationSpeed}</Text>
                  </View>
                  
                  <TouchableOpacity 
                    style={[styles.speedButton, styles.increaseButton, simulationSpeed >= 20 && styles.disabledButton]}
                    onPress={increaseSpeed}
                    disabled={simulationSpeed >= 20}
                  >
                    <Text style={styles.speedButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.infoText}>
                  Simüle edilmiş konumu değiştirmek için haritada uzun basın.
                </Text>
              </View>
            )}
            
            <Text style={styles.paragraph}>
              {location
                ? `${isSimulationMode ? 'Simüle' : 'Gerçek'} konum: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                : 'Konum alınıyor...'}
            </Text>
            
            {targetLocation && (
              <Text style={styles.paragraph}>
                Hedef konum: {targetLocation.latitude.toFixed(5)}, {targetLocation.longitude.toFixed(5)}
              </Text>
            )}
            
            {location && targetLocation && (
              <Text style={styles.paragraph}>
                Hedefe uzaklık: {getDistanceToTarget()} metre
              </Text>
            )}
            
            <Text style={styles.infoText}>
              Haritada hedefinizi belirlemek için dokunun.
              {isSimulationMode 
                ? " Simüle konumu değiştirmek için haritada uzun basın." 
                : " Takip başlatıldığında, hedef alana yaklaştığınızda uygulama kapalı olsa bile bildirim alacaksınız."}
            </Text>
            
            <View style={styles.buttonContainer}>
              {!trackingEnabled ? (
                <TouchableOpacity 
                  style={[styles.button, styles.startButton]} 
                  onPress={startTracking}
                >
                  <Text style={styles.buttonText}>
                    {isSimulationMode ? "Simülasyonu Başlat" : "Takibi Başlat"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={[styles.button, styles.stopButton]} 
                  onPress={stopTracking}
                >
                  <Text style={styles.buttonText}>
                    {isSimulationMode ? "Simülasyonu Durdur" : "Takibi Durdur"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Bildirim için izin alma
async function registerForPushNotificationsAsync() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    Alert.alert('Hata', 'Bildirim izni olmadan hedefe yaklaştığınızda uyarı alamazsınız!');
    return;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  mapContainer: {
    flex: 2,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  controls: {
    flex: 1,
    padding: 16,
    backgroundColor: 'white',
  },
  paragraph: {
    marginVertical: 8,
    fontSize: 14,
  },
  errorText: {
    color: 'red',
    fontSize: 14,
    marginVertical: 8,
  },
  infoText: {
    marginVertical: 12,
    fontSize: 12,
    color: '#555',
    fontStyle: 'italic',
  },
  buttonContainer: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 12,
    paddingHorizontal: 8,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  speedContainer: {
    marginVertical: 12,
    paddingHorizontal: 8,
  },
  speedLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  speedButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  speedButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decreaseButton: {
    backgroundColor: '#e0e0e0',
  },
  increaseButton: {
    backgroundColor: '#4a86f7',
  },
  disabledButton: {
    opacity: 0.5,
  },
  speedButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  speedValueContainer: {
    width: 60,
    alignItems: 'center',
  },
  speedValueText: {
    fontSize: 18,
    fontWeight: 'bold',
  }
});