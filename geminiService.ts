
import { GoogleGenAI, Type } from "@google/genai";

export async function identifyModelFromImage(base64Image: string): Promise<string | null> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    // สกัดเฉพาะข้อมูล base64
    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    
    // กำหนด MIME Type ให้ตรงกับข้อมูลที่ส่งมา (แนะนำ PNG เพื่อความคมชัดของตัวอักษร)
    let mimeType = 'image/png';
    if (base64Image.includes('image/jpeg')) mimeType = 'image/jpeg';
    if (base64Image.includes('image/webp')) mimeType = 'image/webp';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025', // ใช้โมเดลรุ่นใหม่ล่าสุดที่รองรับ Vision ได้ดีเยี่ยม
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: "Identify the CD player in this image. Look for the Brand (e.g., Sony, Marantz, Denon, Philips) and the specific Model Number (e.g., CDP-337ESD, CD-63, DCD-1500) printed on the front panel. Return ONLY the identified 'Brand Model' as a short string. If you are not sure, try to read any text that looks like a model number. Return 'NOT_FOUND' only if there is absolutely no readable text.",
          },
        ],
      },
    });
    
    const result = response.text?.trim().replace(/[*"']/g, ''); 
    if (!result || result.toUpperCase().includes('NOT_FOUND') || result.length < 3) {
      return null;
    }
    return result;
  } catch (error) {
    console.error("Gemini Vision API Error:", error);
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
      contents: `Find technical specs for Hi-Fi CD Player: "${modelName}". Required: DAC chip and Laser Pickup model. Return valid JSON only. Format: {"dac": "...", "laser": "..."}`,
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
