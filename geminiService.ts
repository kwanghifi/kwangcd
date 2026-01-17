
import { GoogleGenAI, Type } from "@google/genai";

export async function identifyModelFromImage(base64Image: string): Promise<string | null> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    // ตรวจสอบและสกัดเอาเฉพาะข้อมูล base64 ที่แท้จริง
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
            text: "You are an expert in vintage audio equipment. Identify the CD PLAYER brand and model number from this image. Return ONLY the model name as a short string (e.g., 'Sony CDP-227ESD'). Do not include any sentences or extra text. If you are not sure, return 'NOT_FOUND'.",
          },
        ],
      },
    });
    
    const result = response.text?.trim().replace(/^"(.*)"$/, '$1'); // ลบอัญประกาศถ้ามี
    return (!result || result.includes('NOT_FOUND')) ? null : result;
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
      Example: {"dac": "2 x PCM56P-J & YM3414", "laser": "KSS-151A"}`,
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
