// Load environment variables from .env file
require('dotenv').config();

(function() {
    emailjs.init(process.env.EMAILJS_KEY);
})();

const CONFIG = {
    GITHUB_ACCESS_TOKEN: process.env.GITHUB_ACCESS_TOKEN,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    REPO_OWNER: 'GerediNIYIBIGIRA',
    REPO_NAME: 'AI_ProjectMethod_Assignment'
};

const translations = {
    en: {
        welcome: "Hello! I'm your MIGEPROF Information Assistant. How can I help you today?",
        inputPlaceholder: "Type your question here...",
        sendButton: "Send",
        feedbackButton: "Feedback",
        feedbackTitle: "Your Feedback",
        feedbackPlaceholder: "Share your feedback here...",
        ratingText: "Rating:",
        submitFeedback: "Submit Feedback"
    },
    fr: {
        welcome: "Bonjour! Je suis votre assistant d'information MIGEPROF. Comment puis-je vous aider aujourd'hui?",
        inputPlaceholder: "Tapez votre question ici...",
        sendButton: "Envoyer",
        feedbackButton: "Commentaires",
        feedbackTitle: "Vos Commentaires",
        feedbackPlaceholder: "Partagez vos commentaires ici...",
        ratingText: "Évaluation:",
        submitFeedback: "Soumettre"
    },
    rw: {
        welcome: "Muraho! Ndi umufasha wawe wa MIGEPROF. Ese nakugirira iyihe neza uyu munsi?",
        inputPlaceholder: "Andika ikibazo cyawe hano...",
        sendButton: "Ohereza",
        feedbackButton: "Igitekerezo",
        feedbackTitle: "Igitekerezo Cyawe",
        feedbackPlaceholder: "Sangiza hano igitekerezo cyawe...",
        ratingText: "Amanota:",
        submitFeedback: "Ohereza Igitekerezo"
    }
};

let currentLang = 'en';

function changeLanguage(lang) {
    currentLang = lang;
            
    document.getElementById('userInput').placeholder = translations[lang].inputPlaceholder;
    document.querySelector('.bot-message').textContent = translations[lang].welcome;
    document.querySelector('.chat-input button').textContent = translations[lang].sendButton;
    document.querySelector('.feedback-section h3').textContent = translations[lang].feedbackTitle;
    document.getElementById('feedbackText').placeholder = translations[lang].feedbackPlaceholder;
    document.querySelector('.rating span').textContent = translations[lang].ratingText;
            
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
}

document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => changeLanguage(btn.dataset.lang));
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        
let currentRating = 0;

function createTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing-indicator';
            
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
            
    const text = document.createElement('span');
    text.className = 'typing-text';
    text.textContent = 'MIGEPROF AI is thinking...';
            
    typingDiv.appendChild(spinner);
    typingDiv.appendChild(text);
    return typingDiv;
}

function showDocumentProcessing() {
    const processingDiv = document.createElement('div');
    processingDiv.className = 'message bot-message';
    processingDiv.innerHTML = `
        <div class="processing-indicator">
            <div class="spinner"></div>
            <span>Processing documents...</span>
        </div>
    `;
    document.getElementById('chatMessages').appendChild(processingDiv);
    return processingDiv;
}

function formatMessageContent(content) {
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return content;
}

async function shouldUseRAG(userMessage) {
    const documentKeywords = [
        'policy', 'procedure', 'guideline', 'document', 'report',
        'statistics', 'regulation', 'law', 'program', 'initiative',
        'contact', 'office', 'department', 'service'
    ];
            
    const needsDocuments = documentKeywords.some(keyword => 
        userMessage.toLowerCase().includes(keyword.toLowerCase())
    );
            
    const factsPattern = /what|when|where|who|how|why|which/i;
    const needsFacts = factsPattern.test(userMessage);
            
    return needsDocuments || needsFacts;
}

async function loadGithubDocuments() {
    try {
        const response = await axios.get(`https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents`, {
            headers: {
                'Authorization': `token ${CONFIG.GITHUB_ACCESS_TOKEN}`
            }
        });
                
        return response.data.filter(file => 
            file.name.endsWith('.txt') || 
            file.name.endsWith('.md') || 
            file.name.endsWith('.pdf')
        );
    } catch (error) {
        console.error('Error loading GitHub documents:', error);
        return [];
    }
}

async function getOpenAIResponse(userMessage) {
    let contextualInfo = '';
    const needsRAG = await shouldUseRAG(userMessage);
            
    if (needsRAG) {
        const processingIndicator = showDocumentProcessing();
                
        try {
            const [githubDocs, tavilySearch] = await Promise.all([
                loadGithubDocuments(),
                axios.get(`https://api.tavily.com/search`, {
                    params: {
                        q: userMessage,
                        api_key: CONFIG.TAVILY_API_KEY
                    }
                })
            ]);

            if (githubDocs.length > 0) {
                contextualInfo += 'Internal documents found: ' + 
                    githubDocs.map(d => d.name).join(', ') + '\n';
            }

            if (tavilySearch.data.results && tavilySearch.data.results.length > 0) {
                contextualInfo += 'External sources: ' + 
                    tavilySearch.data.results.slice(0, 2)
                        .map(r => r.title)
                        .join(', ');
            }

            processingIndicator.remove();
        } catch (error) {
            console.error('RAG search error:', error);
            processingIndicator.remove();
        }
    }
            
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{
                    role: "system",
                    content: `You are a helpful assistant for MIGEPROF (Ministry of Gender and Family Promotion) that provides information about policies, guidelines, services, and contact information. Context: ${contextualInfo}. Please respond in ${currentLang === 'en' ? 'English' : currentLang === 'fr' ? 'French' : 'Kinyarwanda'}.`
                }, {
                    role: "user",
                    content: userMessage
                }],
                temperature: 0.7,
                stream: true
            })
        });

        const reader = response.body.getReader();
        let partialResponse = '';
        const typingMessage = document.createElement('div');
        typingMessage.className = 'message bot-message';
        document.getElementById('chatMessages').appendChild(typingMessage);

        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
                    
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
                    
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const jsonData = JSON.parse(line.slice(6));
                        if (jsonData.choices[0].delta.content) {
                            partialResponse += jsonData.choices[0].delta.content;
                            typingMessage.innerHTML = formatMessageContent(partialResponse);
                        }
                    } catch (e) {
                        console.error('Error parsing JSON:', e);
                    }
                }
            }
        }
        return partialResponse;
    } catch (error) {
        console.error('Error:', error);
        return "I apologize, but I'm having trouble connecting to the server. Please try again later.";
    }
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
            
    if (message) {
        addMessage(message, 'user');
        const typingIndicator = createTypingIndicator();
        document.getElementById('chatMessages').appendChild(typingIndicator);
                
        const response = await getOpenAIResponse(message);
                
        typingIndicator.remove();
        input.value = '';
    }
}

function addMessage(text, sender) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
            
    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `
        <span>${sender === 'user' ? 'You' : 'MIGEPROF AI'}</span>
        <span>${new Date().toLocaleTimeString()}</span>
    `;
            
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = formatMessageContent(text);
            
    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.getElementById('userInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

document.querySelectorAll('.topic-item').forEach(topic => {
    topic.addEventListener('click', () => {
        const topicName = topic.textContent;
        addMessage(`What would you like to know about ${topicName}?`, 'bot');
        document.getElementById('userInput').placeholder = `Ask your question about ${topicName}...`;
        document.getElementById('userInput').focus();
    });
});

document.querySelectorAll('.star').forEach(star => {
    star.addEventListener('mouseenter', (e) => {
        const rating = e.target.dataset.rating;
        highlightStars(rating);
    });
            
    star.addEventListener('mouseleave', () => {
        highlightStars(currentRating);
    });
            
    star.addEventListener('click', (e) => {
        currentRating = e.target.dataset.rating;
        highlightStars(currentRating);
    });
});

function highlightStars(rating) {
    document.querySelectorAll('.star').forEach(star => {
        star.classList.toggle('active', star.dataset.rating <= rating);
    });
}

function toggleFeedback() {
    const feedbackSection = document.querySelector('.feedback-section');
    feedbackSection.style.display = feedbackSection.style.display === 'none' ? 'block' : 'none';
}

async function submitFeedback() {
    const feedbackText = document.getElementById('feedbackText').value;
    if (!feedbackText || currentRating === 0) {
        alert('Please provide both feedback and rating');
        return;
    }

    try {
        // Show loading state
        const submitButton = document.querySelector('.feedback-section button');
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';

        const result = await emailjs.send(
            "service_2ya3fhd", 
            "template_z7zxxzb", 
            {
                to_name: "MIGEPROF Team",
                from_name: "MIGEPROF Information Assistant User",
                message: `Feedback: ${feedbackText}\nRating: ${currentRating}/5`,
                to_email: 'niygeredi@gmail.com',
                timestamp: new Date().toLocaleString()
            }
        );

        // Reset UI on success
        submitButton.disabled = false;
        submitButton.textContent = translations[currentLang].submitFeedback;

        if (result.status === 200) {
            alert('Feedback sent successfully!');
            addMessage('Thank you for your feedback! We appreciate your input to help improve our service.', 'bot');
            document.getElementById('feedbackText').value = '';
            currentRating = 0;
            highlightStars(0);
            document.querySelector('.feedback-section').style.display = 'none';
        }
    } catch (error) {
        console.error('Feedback submission error:', error);
        alert(`Error sending feedback: ${error.text || 'Please try again later'}`);
        
        // Reset button state
        const submitButton = document.querySelector('.feedback-section button');
        submitButton.disabled = false;
        submitButton.textContent = translations[currentLang].submitFeedback;
    }
}

function setupVoiceInput() {
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
                
        recognition.onresult = function(event) {
            const text = event.results[0][0].transcript;
            document.getElementById('userInput').value = text;
        };
                
        const voiceButton = document.createElement('button');
        voiceButton.className = 'voice-input';
        voiceButton.innerHTML = '🎤';
        voiceButton.onclick = () => recognition.start();
                
        document.querySelector('.chat-input').appendChild(voiceButton);
    }
}

setupVoiceInput();
