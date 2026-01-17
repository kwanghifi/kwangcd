
import { GoogleGenAI, Type } from "@google/genai";

export async function identifyModelFromImage(base64Image: string): Promise<string | null> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    const mimeType = base64Image.includes('image/png') ? 'image/png' : 'image/jpeg';

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: "Identify the CD player model from this image. Look closely at the manufacturer logo (like Sony, Marantz, Denon) and the model code (usually near the display or tray). Return ONLY the brand and model number as a simple string, for example: 'Marantz CD-63'. If you can't see a model clearly, try to guess the most likely one based on visual cues. If completely unknown, return 'UNKNOWN'.",
          },
        ],
      },
    });
    
    const result = response.text?.trim().replace(/[*"']/g, ''); 
    if (!result || result.toUpperCase().includes('UNKNOWN') || result.length < 3) {
      return null;
    }
    return result;
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
      contents: `Search technical specifications for: "${modelName}" Hi-Fi CD Player. I need the DAC chip model and the Laser Pickup / Optical block model. 
      Return ONLY valid JSON with keys "dac" and "laser". 
      Example: {"dac": "TDA1541A", "laser": "CDM-4/19"}`,
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
