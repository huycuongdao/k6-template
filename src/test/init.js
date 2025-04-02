import http from "k6/http";
import { sleep, check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import { hmac } from "k6/crypto";
import { BASE_URL } from "../config/constants.js";
import { SECRET_KEY } from "../env/env.js";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { generateTimestamp } from "../utils/generateTimestamp.js";

// Configuration
const CONFIG = {
  API_ENDPOINT: `${BASE_URL}/test/init`,
  HEADERS: {
    "Content-Type": "application/json",
  },
  HTTP_PARAMS: {
    timeout: "120s",
  },
  DEFAULT_AMOUNT: 1000,
};

// Metrics
export const metrics = {
  errorRate: new Rate("errors"),
  requestCount: new Counter("requests"),
  responseTime: new Trend("response_time", true),
};

// Test Options
export const options = {
  scenarios: {
    check_balance_scenario: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 10000,
      stages: [
        { duration: "500s", target: 500 },
        { duration: "300s", target: 500 },
      ],
    },
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(50)", "p(90)", "p(95)", "p(99)"],
  thresholds: {
    http_req_duration: ["p(99) <= 120"],
    http_req_failed: ["rate < 0.01"],
  },
};

// Helper Functions
function generateSignature(requestId, phoneNumber, token, amount) {
  const signatureString = [`orderId=${requestId}`, `amount=${amount}`, `token=${token}`].join("&");

  return hmac("sha256", SECRET_KEY, signatureString, "hex");
}

function createPayload(testData) {
  const requestId = `${generateTimestamp()}:${testData.phoneNumber}`;
  const signature = generateSignature(requestId, testData.phoneNumber, testData.token, CONFIG.DEFAULT_AMOUNT);

  return JSON.stringify({
    requestId,
    orderId: requestId,
    phoneNumber: testData.phoneNumber,
    token: testData.token,
    lang: "en",
    partnerClientId: testData.phoneNumber,
    amount: CONFIG.DEFAULT_AMOUNT,
    signature,
  });
}

// Main Test Function
export default function () {
  const payload = createPayload(testData);
  const response = http.post(CONFIG.API_ENDPOINT, payload, { headers: CONFIG.HEADERS }, CONFIG.HTTP_PARAMS);

  // Logging
  console.log(`Request ID: ${JSON.parse(payload).requestId}`);
  console.log("Response: ", JSON.parse(response.body));
  console.log(`Status: ${response.status}`);

  // Checks
  const success = check(response, {
    "status is 200": (r) => r.status === 200,
    "response time <= 120ms": (r) => r.timings.duration <= 120,
  });

  // Record metrics
  metrics.errorRate.add(!success);
  metrics.requestCount.add(1);
  metrics.responseTime.add(response.timings.duration);
}
