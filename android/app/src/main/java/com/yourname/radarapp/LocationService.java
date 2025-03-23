package com.yourname.radarapp;  // Paket adınızı buraya yazın

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

public class LocationService extends Service {
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}