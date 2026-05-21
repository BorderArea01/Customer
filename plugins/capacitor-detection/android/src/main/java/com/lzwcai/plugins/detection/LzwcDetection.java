package com.lzwcai.plugins.detection;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;
import com.google.mlkit.vision.segmentation.Segmentation;
import com.google.mlkit.vision.segmentation.SegmentationMask;
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class LzwcDetection {
    // Foreground probability threshold for person pixels
    private static final float FOREGROUND_CONFIDENCE_THRESHOLD = 0.6f;
    // Minimum largest connected component area ratio to consider a valid person (e.g., 0.5%)
    private static final float MIN_COMPONENT_AREA_RATIO = 0.005f;
    
    public interface PersonDetectionCallback {
        void onResult(JSObject result);
    }
    
    // Largest connected foreground component structure
    private static class PersonRegion {
        final android.graphics.Rect bounds;
        final int pixelCount;
        final double coveragePercent;

        PersonRegion(android.graphics.Rect bounds, int pixelCount, double coveragePercent) {
            this.bounds = bounds;
            this.pixelCount = pixelCount;
            this.coveragePercent = coveragePercent;
        }
    }

    private List<PersonRegion> findTopPersonRegions(SegmentationMask mask, float threshold, int maxRegions) {
        try {
            int width = mask.getWidth();
            int height = mask.getHeight();

            java.nio.ByteBuffer byteBuffer = mask.getBuffer();
            java.nio.ByteBuffer duplicated = byteBuffer.duplicate();
            duplicated.rewind();
            duplicated.order(ByteOrder.nativeOrder());
            FloatBuffer floatBuffer = duplicated.asFloatBuffer();

            boolean[] visited = new boolean[width * height];
            int[] dx = {1, -1, 0, 0};
            int[] dy = {0, 0, 1, -1};

            ArrayDeque<int[]> queue = new ArrayDeque<>();
            List<PersonRegion> regions = new ArrayList<>();

            int totalPixels = width * height;
            for (int start = 0; start < totalPixels; start++) {
                if (visited[start]) continue;
                float conf = floatBuffer.get(start);
                if (conf <= threshold) { visited[start] = true; continue; }

                // BFS for a foreground component
                int startY = start / width;
                int startX = start % width;
                queue.clear();
                queue.add(new int[]{startX, startY});
                visited[start] = true;

                int count = 0;
                int minX = startX, minY = startY, maxX = startX, maxY = startY;

                while (!queue.isEmpty()) {
                    int[] p = queue.removeFirst();
                    int x = p[0], y = p[1];
                    count++;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;

                    for (int dir = 0; dir < 4; dir++) {
                        int nx = x + dx[dir];
                        int ny = y + dy[dir];
                        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                        int idx = ny * width + nx;
                        if (visited[idx]) continue;
                        float c = floatBuffer.get(idx);
                        if (c > threshold) {
                            visited[idx] = true;
                            queue.addLast(new int[]{nx, ny});
                        } else {
                            visited[idx] = true;
                        }
                    }
                }

                if (count > 0) {
                    double coveragePercent = (double) count / (width * height) * 100.0;
                    android.graphics.Rect bounds = new android.graphics.Rect(minX, minY, maxX + 1, maxY + 1);
                    regions.add(new PersonRegion(bounds, count, coveragePercent));
                }
            }

            // Sort by size desc and take top K
            regions.sort(Comparator.comparingInt((PersonRegion r) -> r.pixelCount).reversed());
            if (regions.size() > maxRegions) {
                return new ArrayList<>(regions.subList(0, maxRegions));
            }
            return regions;
        } catch (Exception e) {
            Log.e("LzwcDetection", "findTopPersonRegions failed", e);
            return Collections.emptyList();
        }
    }

    public interface FaceDetectionCallback {
        void onResult(JSObject result);
    }
    
    private Context context;
    private FaceDetector faceDetector;
    private com.google.mlkit.vision.segmentation.Segmenter segmenter;
    private boolean modelsLoaded = false;

    public LzwcDetection(Context context) {
        this.context = context;
    }

    public String echo(String value) {
        Log.i("LzwcDetection", "Echo: " + value);
        return value;
    }

    public void loadModels() {
        if (modelsLoaded) return;
        
        FaceDetectorOptions options = new FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                .setMinFaceSize(0.2f)
                .enableTracking()
                .build();
        
        faceDetector = FaceDetection.getClient(options);
        
        // Initialize segmenter for person detection
        SelfieSegmenterOptions segmenterOptions = new SelfieSegmenterOptions.Builder()
                .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
                .build();
        
        segmenter = Segmentation.getClient(segmenterOptions);
        modelsLoaded = true;
    }

    public void detectFaces(String base64Image, double minArea, double maxArea, double minConfidence, double maxFaceAngle, boolean requireFrontalFace, FaceDetectionCallback callback) {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        
        try {
            Bitmap bitmap = base64ToBitmap(base64Image);
            if (bitmap == null) {
                result.put("results", results);
                callback.onResult(result);
                return;
            }
            
            InputImage image = InputImage.fromBitmap(bitmap, 0);
            
            final int imageWidth = bitmap.getWidth();
            final int imageHeight = bitmap.getHeight();

            faceDetector.process(image)
                .addOnSuccessListener(faces -> {
                    try {
                        JSObject bestFace = null;
                        double bestArea = 0.0;
                        
                        for (Face face : faces) {
                            android.graphics.Rect bounds = face.getBoundingBox();
                            int bw = Math.max(0, bounds.width());
                            int bh = Math.max(0, bounds.height());
                            double area = (double) bw * (double) bh;
                            double areaRatio = (imageWidth > 0 && imageHeight > 0)
                                    ? (area / (double) (imageWidth * imageHeight))
                                    : 0.0;

                            // 计算综合置信度评分
                            float confidence = calculateFaceConfidence(face);

                            // 检查是否为正脸
                            boolean isFrontalFace = isFrontalFace(face, maxFaceAngle);
                            if (requireFrontalFace && !isFrontalFace) {
                                continue; // 跳过非正脸
                            }

                            // 应用置信度和面积/占比阈值过滤
                            boolean areaOk;
                            if (minArea <= 1.0 && maxArea <= 1.0) {
                                // 视为占比阈值 (0..1)
                                areaOk = areaRatio >= minArea && areaRatio <= maxArea;
                            } else {
                                // 视为像素面积阈值
                                areaOk = area >= minArea && area <= maxArea;
                            }
                            if (!areaOk || confidence < minConfidence) continue;
                            
                            // 只保留面积最大的人脸（最靠近相机）
                            if (area > bestArea) {
                                String imageUrl = getFaceAreaImage(bitmap, bounds, 1.5);
                                
                                JSObject faceResult = new JSObject();
                                faceResult.put("area", area);
                                faceResult.put("confidence", (double)confidence);
                                
                                JSObject box = new JSObject();
                                box.put("x", bounds.left);
                                box.put("y", bounds.top);
                                box.put("width", bounds.width());
                                box.put("height", bounds.height());
                                
                                faceResult.put("box", box);
                                faceResult.put("imageUrl", imageUrl);
                                
                                bestFace = faceResult;
                                bestArea = area;
                            }
                        }
                        
                        // 只返回最好的一个人脸
                        if (bestFace != null) {
                            results.put(bestFace);
                        }
                        
                        result.put("results", results);
                        callback.onResult(result);
                        
                    } catch (Exception e) {
                        Log.e("LzwcDetection", "Face detection processing failed", e);
                        result.put("results", results);
                        callback.onResult(result);
                    }
                })
                .addOnFailureListener(e -> {
                    Log.e("LzwcDetection", "Face detection failed", e);
                    result.put("results", results);
                    callback.onResult(result);
                });
            
        } catch (Exception e) {
            Log.e("LzwcDetection", "Error in detectFaces", e);
            result.put("results", results);
            callback.onResult(result);
        }
    }

    public void detectPersons(String base64Image, int maxPersons, double minCoverage, PersonDetectionCallback callback) {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        
        try {
            Bitmap bitmap = base64ToBitmap(base64Image);
            if (bitmap == null) {
                result.put("results", results);
                callback.onResult(result);
                return;
            }
            
            InputImage image = InputImage.fromBitmap(bitmap, 0);
            
            segmenter.process(image)
                .addOnSuccessListener(mask -> {
                    try {
                        if (mask != null) {
                            List<PersonRegion> regions = findTopPersonRegions(mask, FOREGROUND_CONFIDENCE_THRESHOLD, Math.max(1, maxPersons));
                            int widthMask = mask.getWidth();
                            int heightMask = mask.getHeight();
                            int totalPixels = widthMask * heightMask;

                            for (PersonRegion region : regions) {
                                double sizeRatio = (double) region.pixelCount / totalPixels;
                                if (region.coveragePercent >= minCoverage && sizeRatio >= MIN_COMPONENT_AREA_RATIO) {
                                    JSObject personResult = new JSObject();
                                    personResult.put("coverage", region.coveragePercent);
                                    if (region.bounds != null) {
                                        personResult.put("bounds", createBoundsObject(region.bounds));
                                    }
                                    results.put(personResult);
                                }
                            }
                        }
                        
                        result.put("results", results);
                        callback.onResult(result);
                        
                    } catch (Exception e) {
                        Log.e("LzwcDetection", "Person detection processing failed", e);
                        result.put("results", results);
                        callback.onResult(result);
                    }
                })
                .addOnFailureListener(e -> {
                    Log.e("LzwcDetection", "Person detection failed", e);
                    result.put("results", results);
                    callback.onResult(result);
                });
            
        } catch (Exception e) {
            Log.e("LzwcDetection", "Error in detectPersons", e);
            result.put("results", results);
            callback.onResult(result);
        }
    }

    public boolean isModelsLoaded() {
        return modelsLoaded;
    }

    public void dispose() {
        if (faceDetector != null) {
            faceDetector.close();
            faceDetector = null;
        }
        if (segmenter != null) {
            segmenter.close();
            segmenter = null;
        }
        modelsLoaded = false;
    }

    private Bitmap base64ToBitmap(String base64Str) {
        try {
            byte[] decodedBytes = Base64.decode(base64Str, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);
        } catch (Exception e) {
            Log.e("LzwcDetection", "Failed to decode base64", e);
            return null;
        }
    }

    private String getFaceAreaImage(Bitmap originalBitmap, android.graphics.Rect faceBounds, double multiple) {
        try {
            int width = originalBitmap.getWidth();
            int height = originalBitmap.getHeight();
            
            // Calculate expanded bounds
            int centerX = faceBounds.centerX();
            int centerY = faceBounds.centerY();
            
            int expandedWidth = (int) (faceBounds.width() * multiple);
            int expandedHeight = (int) (faceBounds.height() * multiple);
            
            int left = Math.max(0, centerX - expandedWidth / 2);
            int top = Math.max(0, centerY - expandedHeight / 2);
            int right = Math.min(width, left + expandedWidth);
            int bottom = Math.min(height, top + expandedHeight);
            
            // Ensure valid dimensions
            if (right <= left || bottom <= top) {
                return "";
            }
            
            // Crop the face area
            Bitmap croppedBitmap = Bitmap.createBitmap(originalBitmap, left, top, right - left, bottom - top);
            
            // Convert to base64
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            croppedBitmap.compress(Bitmap.CompressFormat.JPEG, 90, byteArrayOutputStream);
            byte[] byteArray = byteArrayOutputStream.toByteArray();
            
            return "data:image/jpeg;base64," + Base64.encodeToString(byteArray, Base64.DEFAULT);
            
        } catch (Exception e) {
            Log.e("LzwcDetection", "Failed to get face area image", e);
            return "";
        }
    }

    private double calculatePersonCoverage(SegmentationMask mask) {
        try {
            java.nio.ByteBuffer byteBuffer = mask.getBuffer();
            java.nio.ByteBuffer duplicated = byteBuffer.duplicate();
            duplicated.rewind();
            duplicated.order(ByteOrder.nativeOrder());
            FloatBuffer floatBuffer = duplicated.asFloatBuffer();

            int width = mask.getWidth();
            int height = mask.getHeight();
            int totalPixels = width * height;
            int personPixels = 0;
            
            for (int i = 0; i < totalPixels; i++) {
                float confidence = floatBuffer.get(i); // 0..1 foreground probability
                if (confidence > 0.5f) {
                    personPixels++;
                }
            }
            
            return (double) personPixels / totalPixels * 100;
        } catch (Exception e) {
            Log.e("LzwcDetection", "Failed to calculate person coverage", e);
            return 0.0;
        }
    }
    
    private android.graphics.Rect calculateSegmentationBounds(SegmentationMask mask) {
        try {
            java.nio.ByteBuffer byteBuffer = mask.getBuffer();
            java.nio.ByteBuffer duplicated = byteBuffer.duplicate();
            duplicated.rewind();
            duplicated.order(ByteOrder.nativeOrder());
            FloatBuffer floatBuffer = duplicated.asFloatBuffer();

            int width = mask.getWidth();
            int height = mask.getHeight();
            int minX = width, minY = height, maxX = -1, maxY = -1;
            boolean foundPerson = false;
            
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    int index = y * width + x;
                    float confidence = floatBuffer.get(index);
                    if (confidence > 0.5f) { // Person pixel
                        foundPerson = true;
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                }
            }
            
            if (foundPerson) {
                // Rect's right/bottom are exclusive, so +1 to include the last pixel
                return new android.graphics.Rect(minX, minY, maxX + 1, maxY + 1);
            }
            
            return null;
        } catch (Exception e) {
            Log.e("LzwcDetection", "Failed to calculate segmentation bounds", e);
            return null;
        }
    }
    
    private JSObject createBoundsObject(android.graphics.Rect bounds) {
        JSObject boundsObj = new JSObject();
        boundsObj.put("left", bounds.left);
        boundsObj.put("top", bounds.top);
        boundsObj.put("right", bounds.right);
        boundsObj.put("bottom", bounds.bottom);
        boundsObj.put("width", bounds.width());
        boundsObj.put("height", bounds.height());
        return boundsObj;
    }
    
    private JSArray sortResultsByArea(JSArray results) {
        // Simple bubble sort for JSArray (in real implementation, use proper sorting)
        return results;
    }

    /**
     * 计算人脸检测的综合置信度评分
     * 基于多个因素：眼睛睁开概率、笑容概率、人脸角度等
     */
    private float calculateFaceConfidence(Face face) {
        float confidence = 0.8f; // 基础置信度

        // 获取眼睛睁开概率
        Float leftEyeOpenProb = face.getLeftEyeOpenProbability();
        Float rightEyeOpenProb = face.getRightEyeOpenProbability();

        // 获取笑容概率
        Float smilingProb = face.getSmilingProbability();

        // 综合评分计算
        float eyeScore = 0.0f;
        if (leftEyeOpenProb != null && rightEyeOpenProb != null) {
            eyeScore = (leftEyeOpenProb + rightEyeOpenProb) / 2.0f;
        }

        float smileScore = smilingProb != null ? smilingProb : 0.5f;

        // 人脸角度影响评分
        float angleX = Math.abs(face.getHeadEulerAngleX());
        float angleY = Math.abs(face.getHeadEulerAngleY());
        float angleZ = Math.abs(face.getHeadEulerAngleZ());

        // 正脸角度越小，置信度越高
        float angleScore = Math.max(0, 1.0f - (angleX + angleY + angleZ) / 90.0f);

        // 综合评分：眼睛睁开程度权重 0.3，笑容权重 0.1，正脸程度权重 0.6
        confidence = eyeScore * 0.3f + smileScore * 0.1f + angleScore * 0.6f;

        // 确保置信度在合理范围内
        return Math.max(0.1f, Math.min(1.0f, confidence));
    }

    /**
     * 检查是否为正脸
     * 基于人脸角度判断是否面向镜头
     */
    private boolean isFrontalFace(Face face, double maxFaceAngle) {
        float angleX = Math.abs(face.getHeadEulerAngleX());
        float angleY = Math.abs(face.getHeadEulerAngleY());
        float angleZ = Math.abs(face.getHeadEulerAngleZ());

        // 计算最大角度
        float maxAngle = Math.max(Math.max(angleX, angleY), angleZ);

        return maxAngle <= maxFaceAngle;
    }
}
