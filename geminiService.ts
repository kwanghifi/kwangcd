
import { GoogleGenAI, Type } from "@google/genai";

export async function identifyModelFromImage(base64Image: string): Promise<string | null> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    
    // ใช้ PNG หรือ JPEG ตามความเหมาะสม
    let mimeType = 'image/png';
    if (base64Image.includes('image/jpeg')) mimeType = 'image/jpeg';

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // อัปเกรดเป็นโมเดลรุ่นล่าสุดที่มีประสิทธิภาพสูงสุด
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: `Act as a Hi-Fi vintage audio expert and OCR specialist. 
            Look at this image of a CD player front panel. 
            1. Identify the BRAND name (e.g. Sony, Marantz, Denon, Teac, A&D, Philips).
            2. Identify the MODEL number (e.g. CDP-X77ES, CD-63, DA-P9500).
            3. Return ONLY the 'Brand Model' string. 
            4. If the text is blurry, provide your best guess of the model number.
            5. If no model is visible, return 'NOT_FOUND'.`,
          },
        ],
      },
    });
    
    const result = response.text?.trim().replace(/[*"']/g, ''); 
    console.log("AI Detected:", result); // สำหรับ Debug ใน Console
    
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
      contents: `Search for the technical specifications of the following Hi-Fi CD Player: "${modelName}". 
      I specifically need:
      1. The DAC (Digital-to-Analog Converter) chip model.
      2. The Laser Pickup (Optical Block) model.
      
      Return ONLY a JSON object with keys "dac" and "laser". 
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
