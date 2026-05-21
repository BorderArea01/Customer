# capacitor-detection

LzwcDetection

## Install

```bash
npm install capacitor-detection
npx cap sync
```

## API

<docgen-index>

* [`echo(...)`](#echo)
* [`loadModels()`](#loadmodels)
* [`detectFaces(...)`](#detectfaces)
* [`detectPersons(...)`](#detectpersons)
* [`isModelsLoaded()`](#ismodelsloaded)
* [`dispose()`](#dispose)
* [Interfaces](#interfaces)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### echo(...)

```typescript
echo(options: { value: string; }) => Promise<{ value: string; }>
```

| Param         | Type                            |
| ------------- | ------------------------------- |
| **`options`** | <code>{ value: string; }</code> |

**Returns:** <code>Promise&lt;{ value: string; }&gt;</code>

--------------------


### loadModels()

```typescript
loadModels() => Promise<void>
```

--------------------


### detectFaces(...)

```typescript
detectFaces(options: { base64: string; minArea?: number; maxArea?: number; minConfidence?: number; maxFaceAngle?: number; requireFrontalFace?: boolean; }) => Promise<{ results: FaceDetectionResult[]; }>
```

| Param         | Type                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ base64: string; minArea?: number; maxArea?: number; minConfidence?: number; maxFaceAngle?: number; requireFrontalFace?: boolean; }</code> |

**Returns:** <code>Promise&lt;{ results: FaceDetectionResult[]; }&gt;</code>

--------------------


### detectPersons(...)

```typescript
detectPersons(options: { base64: string; maxPersons?: number; minCoverage?: number; }) => Promise<{ results: PersonDetectionResult[]; }>
```

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code>{ base64: string; maxPersons?: number; minCoverage?: number; }</code> |

**Returns:** <code>Promise&lt;{ results: PersonDetectionResult[]; }&gt;</code>

--------------------


### isModelsLoaded()

```typescript
isModelsLoaded() => Promise<{ loaded: boolean; }>
```

**Returns:** <code>Promise&lt;{ loaded: boolean; }&gt;</code>

--------------------


### dispose()

```typescript
dispose() => Promise<void>
```

--------------------


### Interfaces


#### FaceDetectionResult

| Prop             | Type                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| **`area`**       | <code>number</code>                                                   |
| **`confidence`** | <code>number</code>                                                   |
| **`box`**        | <code>{ x: number; y: number; width: number; height: number; }</code> |
| **`imageUrl`**   | <code>string</code>                                                   |


#### PersonDetectionResult

| Prop           | Type                |
| -------------- | ------------------- |
| **`coverage`** | <code>number</code> |

</docgen-api>
