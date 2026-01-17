
import { GoogleGenAI, Type } from "@google/genai";

export async function identifyModelFromImage(base64Image: string): Promise<string | null> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image.split(',')[1] || base64Image,
            },
          },
          {
            text: "Identify the CD PLAYER brand and model number from this image. Return ONLY the brand and model number (e.g., Sony CDP-227ESD). If not found, return 'NOT_FOUND'.",
          },
        ],
      },
    });
    const result = response.text?.trim();
    return (!result || result === 'NOT_FOUND') ? null : result;
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    return null;
  }
}

export async function fetchSpecsWithAI(modelName: string): Promise<{ dac: string, laser: string } | null> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Find the technical specifications for the CD Player model: "${modelName}". I need the DAC (Digital-to-Analog Converter) chip name and the Laser Pickup (Optical assembly) model. 
      Return the result in JSON format with keys "dac" and "laser". 
      If unsure, provide the most likely part names. 
      Example: {"dac": "TDA1541A", "laser": "CDM-1"}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dac: { type: Type.STRING },
            laser: { type: Type.STRING }
          },
          required: ["dac", "laser"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Spec Search Error:", error);
    return null;
  }
}
