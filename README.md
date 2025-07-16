# PartyTV

PartyTV is a web application that lets you watch torrent based videos in sync with friends. It uses Firebase for session management and WebTorrent for streaming video files directly from magnet links. This is a project I started for me and my friends to use due to unreliable connection, it's nothing crazy, but I thought I would put it on GitHub for others facing the same issue. I haven't spent much time on input validation or error avoidance so if anything raise an issue and I can work on it.

## Features

- Create a new watch party by submitting a magnet link.
- Share the generated session ID with friends.
- Join an existing session using the session ID.
- Synchronized playback: play, pause, and seek are reflected for all viewers.
- Streams video files directly from torrents (supports `.mp4`, `.mkv`, `.avi`, `.webm`).

## To Do
- [ ] Find and fix bugs
- [ ] Add page to delete old sessions

## Tech Stack

- **Frontend** – HTML/CSS/JavaScript
- **Video Player** – [MediaElement.js](https://github.com/mediaelement/mediaelement)
- **Web Server** – [Express.js](https://github.com/expressjs/express)
- **Torrent Streaming Engine** – [WebTorrent](https://github.com/webtorrent/webtorrent)
- **Session Management & Synchronization** – [Firebase Realtime Database](https://firebase.google.com/docs/database)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A Firebase Realtime Database project (for session management)

### Setup

1. **Clone or Download the Repository**

2. **Configure Firebase**

   - Create a `.env` file in the project root with your Firebase config:
     ```
     apiKey=YOUR_API_KEY
     authDomain=YOUR_AUTH_DOMAIN
     databaseURL=YOUR_DATABASE_URL
     projectId=YOUR_PROJECT_ID
     storageBucket=YOUR_STORAGE_BUCKET
     messagingSenderId=YOUR_MESSAGING_SENDER_ID
     appId=YOUR_APP_ID
     ```

3. **Install Dependencies & Run**

   - Open a terminal in the project folder and run:
     ```sh
     npm install
     ```

   - To start the server run:
     ```sh
     node index.js
     ```        

4. **Open the App**

   - Go to [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Creating a Session

1. Go to [`/create`](http://localhost:3000/create).
2. Enter a torrent magnet link and submit.
3. The session ID will be copied to your clipboard.

### Joining a Session

1. Enter the session ID on the main page and submit.
2. Wait for the torrent to start downloading (may take a few seconds).
3. The video will start playing once enough data is available.

### Watching Together

- Playback is synchronized for all users in the same session.
- Only one video file per torrent is streamed (the largest or most common video format).

## File Structure

- `index.js` - Main server (Express, Firebase, WebTorrent)
- `index.html` - Main landing page (join session)
- `new.html` - Create session page
- `play.html` - Video player page
- `start.bat` - Windows startup script
- `.env` - Firebase credentials (not included in repo)
- `package.json` - Project dependencies

## Troubleshooting

- Make sure Node.js is installed and in your PATH.
- Ensure your `.env` file is correctly configured.
- If the video does not play, check that the torrent contains a supported video file.

## Disclaimer

This project is provided for educational purposes only. The author does not condone or encourage piracy or any illegal activity. You are solely responsible for how you use this software. Please ensure you comply with all applicable laws in your country regarding the use and sharing of copyrighted material. The author assumes no liability for misuse or illegal use

## License

MIT
