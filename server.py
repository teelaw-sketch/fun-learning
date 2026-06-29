import os
import sqlite3
import requests
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import google.generativeai as genai

app = Flask(__name__)
# Enable CORS so your GitHub Pages frontend can talk to Render safely
CORS(app, resources={r"/api/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# Hardcoded Google Credentials
GOOGLE_CLIENT_ID = "680628080297-r9vghsnrlrbglecq5qlfgr78v949f9m0.apps.googleusercontent.com"
# Note: Put your short Client Secret string inside your Render Environment variables as GOOGLE_CLIENT_SECRET
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET") 

# Hardcoded Gemini API Key Configuration
ACTIVE_GEMINI_KEY = "AQ.Ab8RN6JdKh2A92ZVUvnB9iU1fnRrwi_CF6EAHB0j4YdRdJ1LIg"
genai.configure(api_key=ACTIVE_GEMINI_KEY)

# Line 23: Updated to your official, public GitHub Pages student landing layout
FRONTEND_DASHBOARD_URL = "https://teelaw-sketch.github.io/FunLearning/dashboard.html"

DB_PATH = "funlearning.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            class_category TEXT,
            age INTEGER,
            sex TEXT,
            email TEXT UNIQUE NOT NULL,
            password TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.route('/api/auth/google', methods=['GET'])
def google_login():
    """Redirects the student directly to Google's secure account selector."""
    redirect_uri = "https://funlearning-backend.onrender.com/api/auth/google/callback"
    google_auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope=openid%20profile%20email"
    )
    return redirect(google_auth_url)

@app.route('/api/auth/google/callback', methods=['GET'])
def google_callback():
    """Receives code from Google, exchanges it for profile data, and signs user in."""
    code = request.args.get('code')
    if not code:
        return "Authentication code missing from token grid.", 400

    token_url = "https://oauth2.googleapis.com/token"
    redirect_uri = "https://funlearning-backend.onrender.com/api/auth/google/callback"
    
    token_data = {
        'code': code,
        'client_id': GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code'
    }
    
    token_res = requests.post(token_url, data=token_data).json()
    access_token = token_res.get('access_token')
    
    user_info_res = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={'Authorization': f'Bearer {access_token}'}
    ).json()
    
    email = user_info_res.get('email')
    name = user_info_res.get('name', 'Google Learner')

    if not email:
        return "Failed to retrieve email identification from Google account.", 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM students WHERE email = ?", (email,))
    row = cursor.fetchone()
    
    if not row:
        cursor.execute(
            "INSERT INTO students (name, email, password, class_category, age, sex) VALUES (?, ?, 'OAUTH_USER', 'Not Set', 0, 'Not Set')",
            (name, email)
        )
        conn.commit()
    else:
        name = row[0]
    conn.close()

    return redirect(f"{FRONTEND_DASHBOARD_URL}?auth=success&name={name}&email={email}")

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json() or {}
    name = data.get('name')
    class_category = data.get('class_category')
    age = data.get('age')
    sex = data.get('sex')
    email = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        return jsonify({"error": "Missing essential registration parameters."}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO students (name, class_category, age, sex, email, password) VALUES (?, ?, ?, ?, ?, ?)",
            (name, class_category, age, sex, email, password)
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "Registration successful", "student_name": name}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with this email address already exists."}), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT name, password FROM students WHERE email = ?", (email,))
        row = cursor.fetchone()
        conn.close()

        if row and row[1] == password:
            return jsonify({"message": "Authentication successful", "student_name": row[0]}), 200
        return jsonify({"error": "Invalid credentials."}), 411
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/generate-lesson', methods=['POST'])
def generate_lesson():
    data = request.get_json() or {}
    subject = data.get('subject', 'General Studies')
    start_from_scratch = data.get('startFromScratch', True)
    difficulty_areas = data.get('difficultyAreas', '')

    if start_from_scratch:
        prompt = f"Create an easy-to-understand introductory lesson for students on: '{subject}'. Avoid heavy academic jargon."
    else:
        prompt = f"Create a targeted lesson for a student struggling with '{subject}'. Specifically clarify these areas: '{difficulty_areas}'."

    try:
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt)
        return jsonify({"title": f"Adaptive {subject} Node", "content": response.text}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/generate-quiz', methods=['POST'])
def generate_quiz():
    sample_quiz = {
        "question": "Which of the following best demonstrates an core rule of adaptive reasoning?",
        "options": ["Option A: Memorizing answers.", "Option B: Breaking a large topic into smaller steps.", "Option C: Skipping rules.", "Option D: Cramming."],
        "correctIndex": 1,
        "explanation": "Breaking concepts down prevents memory overload."
    }
    return jsonify(sample_quiz), 200

@socketio.on('send_message')
def handle_lounge_message(json_data):
    sender = json_data.get('sender', 'Explorer')
    message = json_data.get('message', '')
    if message.strip() != "":
        emit('receive_message', {'sender': sender, 'message': message}, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
