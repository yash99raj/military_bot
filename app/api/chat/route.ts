import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

export async function POST(request: Request) {
  try {
    const { message, category } = await request.json();

    const contextPrompt = `You are an AI assistant specialized in military emergency protocols. 
    Current emergency category: ${category}.
    
    Provide clear, concise, and actionable guidance for the following situation: ${message}
    
    Format your response in a clear, step-by-step manner using markdown formatting with:
    - Clear headings for different sections
    - Bullet points for steps or key points
    - Important information highlighted
    
    After your main response, suggest 3-4 relevant follow-up scenarios that might occur.`;

    const result = await model.generateContent(contextPrompt);
    const response = result.response.text();

    // Extract suggestions from the response
    const suggestionPattern = /Follow-up scenarios?:([\s\S]*?)(?=\n\n|$)/i;
    const match = response.match(suggestionPattern);

    let suggestions: string[] = [];
    if (match && match[1]) {
      suggestions = match[1]
        .split("\n")
        .map((line) => line.trim().replace(/^[•\-\*]\s*/, ""))
        .filter((line) => line.length > 0);
    }

    // Remove the suggestions section from the main response
    const mainResponse = response.replace(suggestionPattern, "").trim();

    // Create a new ReadableStream for streaming the response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Split into words while preserving markdown formatting
        const words = mainResponse.split(/(?<=[\s\n])/);

        // Send initial chunk immediately
        if (words.length > 0) {
          controller.enqueue(encoder.encode(words[0]));
        }

        // Stream remaining words with minimal delay
        for (let i = 1; i < words.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          controller.enqueue(encoder.encode(words[i]));
        }

        // Small pause before sending suggestions
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Send suggestions as the final chunk
        controller.enqueue(
          encoder.encode("\n" + JSON.stringify({ suggestions, done: true }))
        );

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json(
      { error: "Failed to process the request" },
      { status: 500 }
    );
  }
}
