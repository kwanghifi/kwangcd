
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
            text: "Look at the audio equipment in this image. Focus on the manufacturer logo and the model name/number (usually on the front panel). Return ONLY the Brand and Model Name (e.g., 'TEAC VRDS-25' or 'Marantz CD-63'). If there are multiple devices, identify the main CD Player. Do not include any descriptions, just the name. If unknown, return 'NOT_FOUND'.",
          },
        ],
      },
    });
    
    const result = response.text?.trim().replace(/[*"']/g, ''); 
    return (!result || result.includes('NOT_FOUND') || result.length < 3) ? null : result;
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
      contents: `Search technical specifications for: "${modelName}". I need the DAC chip and the Laser Pickup model. 
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
