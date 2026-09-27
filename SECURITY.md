# Security and Privacy Policy

Privacy and security are fundamental principles of **Tab Audio Recorder**.

---

## 1. Zero-Cloud Privacy Guarantee

Tab Audio Recorder is strictly local software:

- **No Remote Servers**: The extension contains zero backend servers, cloud functions, or proxy endpoints.
- **No Audio Uploads**: Audio streams captured from your browser tabs are recorded into memory (`Blob`) in your local browser instance. Audio never leaves your computer.
- **No Analytics & No Telemetry**: There are no tracking scripts, telemetry collectors, crash reporters, or third-party SDKs.
- **No Account or Authentication Required**: The extension requires no signup, login, API key, or profile.
- **No History or Page Content Harvesting**: Tab titles and URLs are queried strictly in real-time to display the current tab's domain and sanitize the download filename on your local machine. They are never logged or stored.

---

## 2. Minimal Permissions Policy

The extension declares only the absolute minimum permissions required for operation:

| Permission | Browser | Purpose |
|------------|---------|---------|
| `tabCapture` | Chrome | Captures the audio stream from the currently active browser tab upon user action. |
| `offscreen` | Chrome | Runs DOM-dependent audio APIs (`AudioContext`, `MediaRecorder`) in Manifest V3 without blocking or terminating when popup closes. |
| `downloads` | Chrome & Firefox | Saves the generated audio recording (`.webm`/`.ogg`) directly to the user's local Downloads directory. |
| `activeTab` | Chrome & Firefox | Grants temporary access to the currently selected tab strictly when the user clicks the extension icon. |
| `scripting` | Firefox | Injects the local content script bridge to access media streams on the active tab in Firefox. |

The extension **never requests**:
- Full browsing history (`history` permission)
- Cookies or local storage of web pages (`cookies` permission)
- Blanket host permissions (`<all_urls>` or `*://*/*`)
- Network inspection or interception (`webRequest` permission)

---

## 3. Reporting a Vulnerability

If you discover a potential security or privacy flaw, please report it responsibly:

1. **Do not create a public GitHub issue.**
2. Send an email to the project maintainers with details, reproduction steps, and platform information.
3. We will acknowledge receipt within 48 hours and work with you to verify and patch the vulnerability promptly.
