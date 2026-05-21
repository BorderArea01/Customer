package com.lzwcai.plugins.detection;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LzwcDetection")
public class LzwcDetectionPlugin extends Plugin {

    private LzwcDetection implementation;
    
    private LzwcDetection getImplementation() {
        if (implementation == null) {
            implementation = new LzwcDetection(getContext());
        }
        return implementation;
    }

    @PluginMethod
    public void echo(PluginCall call) {
        String value = call.getString("value");
        JSObject ret = new JSObject();
        ret.put("value", getImplementation().echo(value));
        call.resolve(ret);
    }

    @PluginMethod
    public void loadModels(PluginCall call) {
        getImplementation().loadModels();
        call.resolve();
    }

    @PluginMethod
    public void detectFaces(PluginCall call) {
        String base64 = call.getString("base64");
        Double minArea = call.getDouble("minArea", 0.05);
        Double maxArea = call.getDouble("maxArea", 0.3);
        Double minConfidence = call.getDouble("minConfidence", 0.7);
        Double maxFaceAngle = call.getDouble("maxFaceAngle", 30.0);
        Boolean requireFrontalFace = call.getBoolean("requireFrontalFace", true);

        getImplementation().detectFaces(base64, minArea, maxArea, minConfidence, maxFaceAngle, requireFrontalFace, new LzwcDetection.FaceDetectionCallback() {
            @Override
            public void onResult(JSObject result) {
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void detectPersons(PluginCall call) {
        String base64 = call.getString("base64");
        Integer maxPersons = call.getInt("maxPersons", 1);
        Double minCoverage = call.getDouble("minCoverage", 12.0);
        
        getImplementation().detectPersons(base64, maxPersons, minCoverage, new LzwcDetection.PersonDetectionCallback() {
            @Override
            public void onResult(JSObject result) {
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void isModelsLoaded(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("loaded", getImplementation().isModelsLoaded());
        call.resolve(ret);
    }

    @PluginMethod
    public void dispose(PluginCall call) {
        getImplementation().dispose();
        call.resolve();
    }
}
