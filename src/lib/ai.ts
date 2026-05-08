import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface ITineraryEvent {
  time: string;
  title: string;
  description: string;
  location: {
    lat: number;
    lng: number;
    name: string;
  };
  category: string;
}

export interface DayItinerary {
  dayNumber: number;
  activities: ITineraryEvent[];
}

export async function generateItinerary(
  destination: string,
  days: number,
  budget: string,
  preferences: string[]
): Promise<DayItinerary[]> {
  const prompt = `Create a detailed ${days}-day travel itinerary for ${destination}. 
  Budget level: ${budget}. 
  Interests: ${preferences.join(", ")}. 
  Provide a daily breakdown with specific times, catchy titles, detailed descriptions, and geographical coordinates (lat/lng) for each activity.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              dayNumber: { type: Type.INTEGER },
              activities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    location: {
                      type: Type.OBJECT,
                      properties: {
                        lat: { type: Type.NUMBER },
                        lng: { type: Type.NUMBER },
                        name: { type: Type.STRING }
                      },
                      required: ["lat", "lng", "name"]
                    },
                    category: { type: Type.STRING }
                  },
                  required: ["time", "title", "description", "location"]
                }
              }
            },
            required: ["dayNumber", "activities"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text);
  } catch (error) {
    console.error("AI Generation error:", error);
    throw error;
  }
}

export async function regenerateDay(
  destination: string,
  dayNumber: number,
  existingActivities: ITineraryEvent[],
  budget: string
): Promise<DayItinerary> {
  const prompt = `Regenerate the schedule for Day ${dayNumber} in ${destination}. 
  Current activities were: ${existingActivities.map(a => a.title).join(", ")}. 
  Provide a NEW, different set of activities that are even better. 
  Budget level: ${budget}.
  Provide specific times, catchy titles, detailed descriptions, and geographical coordinates (lat/lng).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dayNumber: { type: Type.INTEGER },
            activities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  location: {
                    type: Type.OBJECT,
                    properties: {
                      lat: { type: Type.NUMBER },
                      lng: { type: Type.NUMBER },
                      name: { type: Type.STRING }
                    },
                    required: ["lat", "lng", "name"]
                  },
                  category: { type: Type.STRING }
                },
                required: ["time", "title", "description", "location"]
              }
            }
          },
          required: ["dayNumber", "activities"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text);
  } catch (error) {
    console.error("AI Day Regeneration error:", error);
    throw error;
  }
}
