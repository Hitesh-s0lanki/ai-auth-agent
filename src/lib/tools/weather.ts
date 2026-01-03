import { tool } from "ai";
import { z } from "zod";

export const weatherTool = tool({
  description: "Get the current weather in a location",
  inputSchema: z.object({
    location: z.string().describe("The city and state, e.g. San Francisco, CA"),
    unit: z
      .enum(["celsius", "fahrenheit"])
      .optional()
      .describe("The unit of temperature"),
  }),
  execute: async ({ location, unit = "fahrenheit" }) => {
    try {
      // Simulate weather API call
      // In a real app, you would call an actual weather API like OpenWeatherMap
      
      // Validate location
      if (!location || location.trim().length === 0) {
        throw new Error("Location is required");
      }

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      const temperature = unit === "celsius" 
        ? Math.floor(Math.random() * 30) + 10 // 10-40°C
        : Math.floor(Math.random() * 50) + 50; // 50-100°F
      
      const conditions = [
        "sunny",
        "cloudy",
        "partly cloudy",
        "rainy",
        "windy",
        "clear",
      ];
      const condition = conditions[Math.floor(Math.random() * conditions.length)];

      return {
        location: location.trim(),
        temperature,
        unit: unit === "celsius" ? "°C" : "°F",
        condition,
        humidity: Math.floor(Math.random() * 40) + 40, // 40-80%
        windSpeed: Math.floor(Math.random() * 20) + 5, // 5-25 mph
      };
    } catch (error) {
      // Return error information that the model can use
      return {
        error: true,
        message: error instanceof Error ? error.message : "Failed to get weather data",
        location,
      };
    }
  },
});

