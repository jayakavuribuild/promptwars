# Voyager: AI Trip Planner

Voyager is a production-grade travel orchestration platform that leverages generative AI to transform travel constraints and preferences into actionable, visual itineraries.

## 🚀 The Approach
Voyager uses a **Hybrid Intelligent Architecture**:
- **Generative Plane**: Uses the Gemini 3.1 Flash model to reason through destinations, budget constraints, and temporal flow.
- **Geospatial Plane**: Integrates Google Maps Technical preview for precise coordinate mapping and route visualization.
- **Persistence Plane**: Utilizes Firebase Firestore with Attribute-Based Access Control (ABAC) for secure, low-latency data sync.

## 🛠 Features
- **AI-Driven Logic**: Not just a chatbot, but a structured data generator returning schema-validated JSON itineraries.
- **Interactive Global Mapping**: Real-time marker placement and bounds-fitting for plan visualization.
- **Trip History**: Efficiently caches and retrieves past plans using Firestore indexed queries.
- **Export & Share**: Native sharing integration and JSON export for offline travel.
- **Secure Authentication**: Google OAuth integration for personalized travel vaults.

## 🏗 Architecture
```text
/src
  /lib
    ai.ts        # Gemini model config and structured prompt engineering
    firebase.ts  # Singleton services for Auth/DB and error handling
    utils.ts     # Styling and class merging utilities
  App.tsx        # Main orchestration layer and polished UI components
/firestore.rules # Hardened security blueprints
metadata.json    # App-level permissions and identification
```

## 🔐 Security & Scalability
- **Security**: Implements "Master Gate" rules. Sub-resources (Itineraries) are only accessible if the user owns the parent (Trip) resource, verified via `get()` lookups in rules.
- **Scalability**: Designed with a "List/Get" separation. Large itinerary data is stored in a separate collection to keep the "Trip List" fast and lightweight during initial load.
- **Resource Guarding**: Implements `isValidId()` and size-constraints on all Firestore writes to prevent resource exhaustion attacks.

## 🚥 Setup Instructions
1. **Secrets**: Add `GOOGLE_MAPS_PLATFORM_KEY` and `GEMINI_API_KEY` to your environment variables.
2. **Firebase**: Run `set_up_firebase` (already handled) to provision your regional database.
3. **Deployment**: The app is ready for Cloud Run via the 'Deploy' button.

## 🧠 AI Workflow
1. **Constraint Collection**: User provides destination, duration, and budget.
2. **Contextual Injection**: Prompt templates inject these into a Zero-Shot prompt with a strict JSON schema.
3. **Validation**: The frontend validates the AI response against the `DayItinerary` interface before rendering.
4. **Synchronization**: Validated data is atomically mirrored to Firestore for persistence.
