const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
require('dotenv').config();

const TOKEN         = process.env.DISCORD_TOKEN;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_KEY;
const N8N_BASE_URL  = process.env.N8N_BASE_URL || 'http://localhost:5678';
const activeQuizzes = {};
const { execFile } = require('child_process');
const fs           = require('fs');
const path         = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping
  ],
  partials: ['CHANNEL', 'MESSAGE']
});

const SYSTEM_PROMPT = `IMPORTANT: If the user message is in Urdu, still return JSON with English intent names but extract Urdu values correctly.

You are a JSON extractor for a tuition management system. Read the message carefully and return ONE JSON object only. No explanation. No markdown. Just JSON.

INTENTS AND EXAMPLES:

register_student — adding a new student:
English: "add student Ali class 8 father Ahmed 03001234567 fee 5000"
Urdu: "علی کو شامل کریں کلاس 8 والد احمد 03001234567 فیس 5000"
Return: {"intent":"register_student","name":"Ali","grade":"8","parentName":"Ahmed","parentPhone":"03001234567","feeAmount":5000}

mark_attendance — marking present, absent, or late:
English: "mark Ali absent today"
Urdu: "علی آج غیر حاضر ہے"
Return: {"intent":"mark_attendance","studentName":"Ali","status":"absent","notes":""}

fee_lookup — checking fee balance:
English: "what is Ali's fee balance"
Urdu: "علی کی فیس کیا ہے"
Return: {"intent":"fee_lookup","studentName":"Ali"}

mark_attendance — checking attendance:
English: "what is Ali's attendance"
Urdu: "علی کی حاضری کیا ہے"
Return: {"intent":"mark_attendance","studentName":"Ali","status":"present","notes":"check"}

fee_update — recording payment:
English: "Ali paid his fees" or "Ali paid 5000 transaction ID ABC123"
Urdu: "علی نے فیس دے دی" or "علی نے فیس دی ٹرانزیکشن ABC123"
Return: {"intent":"fee_update","studentName":"first name","mode":"paid || partial","amountPaid":amount as number or null,"transactionId":"transaction ID or null"}

add_homework — assigning homework:
English: "assign Ali maths homework solve exercise 5 by friday"
Urdu: "علی کو ریاضی کا ہوم ورک دو"
Return: {"intent":"add_homework","studentName":"Ali","subject":"Maths","description":"as specified","dueDate":"YYYY-MM-DD"}

list_homework — showing homework:
English: "show Ali's homework"
Urdu: "علی کا ہوم ورک دکھاؤ"
Return: {"intent":"list_homework","studentName":"Ali"}

homework_status — updating homework completion:
English: "mark Ali's maths homework as submitted"
Urdu: "علی نے ریاضی کا ہوم ورک جمع کر دیا"
Return: {"intent":"homework_status","studentName":"Ali","subject":"Maths","status":"Submitted"}

unknown — anything else:
Return: {"intent":"unknown"}

CRITICAL RULES:
- Extract the student first name only
- Return ONLY the JSON object, nothing else
- Never return template placeholders like "full name" or "number"
- If unsure between fee_lookup and mark_attendance for حاضری, use mark_attendance`;

function callGroq(userMessage) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:  'llama3.2:1b',
      prompt: SYSTEM_PROMPT + '\n\nUser message: ' + userMessage + '\n\nReturn JSON only:',
      stream: false
    });

    const options = {
      hostname: 'localhost',
      port:     11434,
      path:     '/api/generate',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = require('http').request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed   = JSON.parse(data);
          const content  = parsed.response;
          const unescaped = content.replace(/\\"/g, '"').replace(/```json|```/g, '').trim();
          const jsonMatch = unescaped.match(/\{[\s\S]*\}/);

          if (!jsonMatch) {
            console.log('No JSON found:', content);
            resolve({ intent: 'unknown' });
            return;
          }

          const result = JSON.parse(jsonMatch[0]);

          const intentMap = {
            'assign_homework': 'add_homework',
            'homework_assign': 'add_homework',
            'create_homework': 'add_homework',
            'homework_add':    'add_homework',
            'attendance':      'mark_attendance',
            'check_fee':       'fee_lookup',
            'check_fees':      'fee_lookup',
            'fee_check':       'fee_lookup',
            'pay_fee':         'fee_update',
            'fee_pay':         'fee_update',
            'update_fee':      'fee_update',
            'homework_list':   'list_homework',
            'get_homework':    'list_homework',
            'homework_update': 'homework_status',
            'update_homework': 'homework_status',
            'register':        'register_student',
            'add_student':     'register_student',
            'create_student':  'register_student'
          };

          if (intentMap[result.intent]) {
            console.log(`Correcting intent: ${result.intent} → ${intentMap[result.intent]}`);
            result.intent = intentMap[result.intent];
          }

          // Urdu keyword fallback
          const isUrdu = /[\u0600-\u06FF]/.test(userMessage);
          if (isUrdu) {
            const msg = userMessage;

            if (/حاضری|حاضر|غیر حاضر|لیٹ/.test(msg)) {
              const nameMatch = msg.match(/([ا-ی]+)\s+(کی|کو|آج|کا)/);
              const name = nameMatch ? nameMatch[1] : result.studentName;
              if (/غیر حاضر/.test(msg)) {
                result.intent = 'mark_attendance'; result.studentName = name; result.status = 'absent'; result.notes = '';
              } else if (/لیٹ/.test(msg)) {
                result.intent = 'mark_attendance'; result.studentName = name; result.status = 'late'; result.notes = '';
              } else if (/حاضر/.test(msg) && !/غیر/.test(msg)) {
                result.intent = 'mark_attendance'; result.studentName = name; result.status = 'present'; result.notes = '';
              } else if (/حاضری کیا/.test(msg) || /کتنے دن/.test(msg)) {
                result.intent = 'fee_lookup'; result.studentName = name;
              }
            }

            if (/فیس|ادائیگی/.test(msg) && !/حاضری/.test(msg)) {
              const nameMatch = msg.match(/([ا-ی]+)\s+(کی|نے|کا)/);
              const name = nameMatch ? nameMatch[1] : result.studentName;
              if (/دے دی|ادا|جمع/.test(msg)) {
                result.intent = 'fee_update'; result.studentName = name; result.mode = 'paid';
              } else {
                result.intent = 'fee_lookup'; result.studentName = name;
              }
            }

            if (/ہوم ورک|ہوم‌ورک/.test(msg)) {
              const nameMatch = msg.match(/([ا-ی]+)\s+(کو|کا|نے)/);
              const name = nameMatch ? nameMatch[1] : result.studentName;
              if (/دکھاؤ|بتاؤ/.test(msg)) {
                result.intent = 'list_homework'; result.studentName = name;
              } else if (/جمع|مکمل/.test(msg)) {
                result.intent = 'homework_status'; result.studentName = name; result.status = 'Submitted';
              } else {
                result.intent = 'add_homework'; result.studentName = name;
              }
            }

            if (/شامل کریں|داخل کریں|رجسٹر/.test(msg)) {
              result.intent = 'register_student';
            }
          }

          if (result.intent === 'fee_update') {
            delete result.name;
            delete result.grade;
            delete result.parentName;
            delete result.parentPhone;
            delete result.feeAmount;
            // Clean up amountPaid
            if (result.mode === 'paid') result.amountPaid = null;
            if (result.amountPaid) result.amountPaid = parseFloat(result.amountPaid) || null;
          }

          if (result.intent === 'fee_lookup') {
            delete result.name;
            delete result.grade;
            delete result.parentName;
            delete result.parentPhone;
            delete result.feeAmount;
          }

          if (result.intent === 'mark_attendance') {
            delete result.name;
            delete result.grade;
            delete result.parentName;
            delete result.parentPhone;
            delete result.feeAmount;
          }

          const urduToEnglish = {
            'علی': 'Ali', 'زید': 'Zaid', 'سارہ': 'Sara', 'احمد': 'Ahmed',
            'عمر': 'Omar', 'فاطمہ': 'Fatima', 'حسن': 'Hassan', 'حسین': 'Hussain',
            'آیشہ': 'Ayesha', 'مریم': 'Maryam', 'طلحہ': 'Talha', 'بلال': 'Bilal',
            'حمزہ': 'Hamza', 'انس': 'Anas', 'زینب': 'Zainab', 'نور': 'Noor'
          };

          if (result.studentName && urduToEnglish[result.studentName]) {
            console.log(`Transliterating: ${result.studentName} → ${urduToEnglish[result.studentName]}`);
            result.studentName = urduToEnglish[result.studentName];
          }

          if (result.studentName) {
            result.studentName = result.studentName.split(' ')[0];
          }

          if (result.intent === 'add_homework') {
            const msg      = userMessage.toLowerCase();
            const subjects = ['maths','math','english','science','physics',
                              'chemistry','biology','history','geography',
                              'urdu','computer','islamiat'];
            let foundSubject = null;
            for (const s of subjects) {
              if (msg.includes(s)) { foundSubject = s.charAt(0).toUpperCase() + s.slice(1); break; }
            }
            if (foundSubject) result.subject = foundSubject;
            if (!result.description || result.description === 'what to do') result.description = userMessage;
            if (!result.dueDate || result.dueDate.includes('2024') || result.dueDate.includes('2023')) {
              const due = new Date(); due.setDate(due.getDate() + 7);
              result.dueDate = due.toISOString().split('T')[0];
            } else {
              result.dueDate = result.dueDate.split('T')[0];
            }
          }

          console.log('Parsed intent:', JSON.stringify(result));
          resolve(result);

        } catch(e) {
          console.error('Ollama parse error:', data);
          resolve({ intent: 'unknown' });
        }
      });
    });

    req.on('error', (e) => {
      console.error('Ollama error:', e.message);
      resolve({ intent: 'unknown' });
    });

    req.write(body);
    req.end();
  });
}



function callN8N(payload, webhookUrl) {
  webhookUrl = webhookUrl || `${N8N_BASE_URL}/webhook/tuition`;

  return new Promise((resolve, reject) => {
    const body    = JSON.stringify(payload);
    const parsed  = new URL(webhookUrl);
    const isHttps = parsed.protocol === 'https:';
    const http    = require(isHttps ? 'https' : 'http');

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (!data || data.trim() === '') { resolve({}); return; }
          const trimmed = data.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            resolve(JSON.parse(trimmed));
          } else {
            resolve({ reply: trimmed });
          }
        } catch(e) {
          console.error('n8n parse error:', data);
          resolve({});
        }
      });
    });

    req.on('error', (e) => {
      console.error('n8n request error:', e.message);
      resolve({});
    });

    req.write(body);
    req.end();
  });
}


async function transcribeAudio(audioUrl, authToken) {
  return new Promise(async (resolve) => {
    try {
      const http    = require('http');
      const https   = require('https');
      const tmpFile = path.join(__dirname, 'temp_audio.ogg');

      // Choose http or https based on URL
      const requester = audioUrl.startsWith('https') ? https : http;

      // Download the audio file from Discord
      const file = fs.createWriteStream(tmpFile);
      const req  = requester.get(audioUrl, {
        headers: { Authorization: `Bot ${TOKEN}` }
      }, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('Audio downloaded, transcribing...');

          // Run transcribe.py
          const scriptPath = path.join(__dirname, 'transcribe.py');
          execFile('python', [scriptPath, tmpFile], (error, stdout, stderr) => {
            fs.unlink(tmpFile, () => {});

            if (error) {
              console.error('Transcription error:', error.message);
              resolve(null);
              return;
            }

            try {
              const result = JSON.parse(stdout.trim());
              if (result.success) {
                console.log('Transcribed text:', result.text);
                resolve(result.text);
              } else {
                console.error('Whisper error:', result.error);
                resolve(null);
              }
            } catch(e) {
              console.error('Parse error:', stdout);
              resolve(null);
            }
          });
        });
      });

      req.on('error', (e) => {
        console.error('Download error:', e.message);
        resolve(null);
      });

    } catch(e) {
      console.error('transcribeAudio error:', e.message);
      resolve(null);
    }
  });
}
client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
});

client.on('disconnect', () => {
  console.log('Bot disconnected. Reconnecting...');
  client.login(TOKEN);
});

client.on('error', (error) => {
  console.error('Discord error:', error.message);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const channelName = message.channel.isDMBased() ? 'dm' : message.channel.name;

  // Handle DM messages — quiz answers only
  if (message.channel.type === 1) {
    const session = activeQuizzes[message.author.id];
    if (!session) {
      await message.reply('No active quiz found. Go to #homework-help and type "quiz me on maths" to start one!');
      return;
    }

    const payload = {
      content:     message.content,
      authorId:    message.author.id,
      authorName:  message.author.username,
      quizId:      session.quizId,
      subject:     session.subject,
      studentName: session.studentName,
      isDM:        true
    };

    try {
      const response = await callN8N(payload, `${N8N_BASE_URL}/webhook/quiz-answer`);
      console.log('Quiz grader raw response:', JSON.stringify(response));

      if (response && response.reply) {
        await message.reply(response.reply);
        if (response.completed) {
          delete activeQuizzes[message.author.id];
          console.log('Quiz session cleared for:', message.author.username);
        }
      } else {
        await message.reply('Quiz graded successfully! Check #bot-logs for details.');
        delete activeQuizzes[message.author.id];
      }
    } catch(e) {
      console.error('DM quiz error:', e.message);
      await message.reply('Quiz was graded but could not send results. Please check with your tutor.');
      delete activeQuizzes[message.author.id];
    }
    return;
  }
  // Voice message detection
  if (message.attachments.size > 0 && !message.channel.isDMBased()) {
    const attachment = message.attachments.first();
    const isVoice    = attachment.contentType &&
                      (attachment.contentType.includes('audio') ||
                        attachment.contentType.includes('ogg')   ||
                        attachment.name?.endsWith('.ogg')        ||
                        attachment.name?.endsWith('.m4a')        ||
                        attachment.name?.endsWith('.mp3')        ||
                        attachment.name?.endsWith('.wav'));

    if (isVoice) {
      if (!['tutor-commands','homework-help','fee-status'].includes(channelName)) return;

      console.log('Voice message in #' + channelName + ' from ' + message.author.username);
      await message.react('⏳');

      const transcribed = await transcribeAudio(attachment.url, TOKEN);

      if (!transcribed) {
        await message.reactions.removeAll().catch(() => {});
        await message.reply('Could not transcribe voice message. Please type your command instead.');
        return;
      }

      await message.reactions.removeAll().catch(() => {});
      await message.react('✅');
      console.log('Processing transcribed message:', transcribed);

      // Create a fake message-like object with the transcribed content
      // then reprocess it through the normal flow
      const fakeContent = transcribed;

      // Show tutor what was heard
      if (channelName === 'tutor-commands') {
        await message.reply(`🎤 Heard: "${fakeContent}"\nProcessing...`);
      }

      // Now process using Ollama intent detection
      const intent = await callGroq(fakeContent);
      console.log('Groq response:', JSON.stringify(intent));

      const now     = new Date();
      const months  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const payload = {
        ...intent,
        today:        now.toISOString().split('T')[0],
        currentMonth: months[now.getMonth()] + ' ' + now.getFullYear(),
        dueDate:      intent.dueDate || lastDay.toISOString().split('T')[0],
        studentId:    'S' + Date.now().toString().slice(-4),
        authorId:     message.author.id,
        authorName:   message.author.username,
        channelId:    message.channel.id,
        channelName:  channelName,
        webhookPath:  'tuition',
        voiceMessage: true,
        originalText: fakeContent
      };

      if (payload.name) {
        payload.firstName = payload.name.split(' ')[0];
        payload.grade     = 'Grade-' + String(payload.grade).replace(/[^0-9]/g, '');
      }

      const response = await callN8N(payload, `${N8N_BASE_URL}/webhook/tuition`);
      console.log('n8n response:', JSON.stringify(response));

      if (response.reply) await message.reply(response.reply);
      return;
    }
  }

  //Handle PDFs Upload in #curriculum
  if (channelName === 'curriculum') {
    if (message.attachments.size > 0) {
      const attachment = message.attachments.first();
      const isPDF = attachment.name?.endsWith('.pdf') ||
                    attachment.contentType?.includes('pdf');

      if (!isPDF) {
        await message.reply('Please upload PDF files only.');
        return;
      }

      await message.react('⏳');
      console.log(`PDF upload: ${attachment.name} from ${message.author.username}`);

      const msgLower     = message.content.toLowerCase();
      const gradeMatch   = msgLower.match(/grade[:\s]+(\d+)/);
      const subjectMatch = msgLower.match(/subject[:\s]+([a-zA-Z]+)/i) ||
                          attachment.name.match(/_([a-zA-Z]+)\./i);

      const grade   = gradeMatch   ? gradeMatch[1]            : 'General';
      const subject = subjectMatch ? subjectMatch[1]           : 'General';

      // Download PDF with Bot token auth
      const https   = require('https');
      const tmpPath = path.join(__dirname, 'temp_upload.pdf');

      try {
        await new Promise((resolve, reject) => {
          const file = fs.createWriteStream(tmpPath);
          const req  = https.get(attachment.url, {
            headers: { Authorization: `Bot ${TOKEN}` }
          }, (response) => {
            if (response.statusCode !== 200) {
              reject(new Error(`Download failed: ${response.statusCode}`));
              return;
            }
            response.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          });
          req.on('error', reject);
        });

        // Read file as base64
        const fileData   = fs.readFileSync(tmpPath);
        const base64Data = fileData.toString('base64');
        fs.unlinkSync(tmpPath);

        const payload = {
          pdfBase64: base64Data,
          filename:  attachment.name,
          grade:     grade,
          subject:   subject,
          authorId:  message.author.id
        };

        const response = await callN8N(payload, `${N8N_BASE_URL}/webhook/upload-pdf`);

        await message.reactions.removeAll().catch(() => {});
        if (response.success) {
          await message.react('✅');
          await message.reply(response.message || `✅ PDF processed! ${attachment.name} added to knowledge base.`);
        } else {
          await message.react('❌');
          await message.reply(response.error || 'Failed to process PDF. Try again.');
        }

      } catch(e) {
        console.error('PDF download error:', e.message);
        await message.reactions.removeAll().catch(() => {});
        await message.react('❌');
        await message.reply(`Could not download PDF: ${e.message}`);
      }
      return;
    }

    if (!message.attachments.size) {
      await message.reply('Please attach a PDF file. Example:\nType `grade:8 subject:Maths` and attach your PDF.');
    }
    return;
  }
  console.log(`Message in #${channelName}: "${message.content}"`);

  let webhookPath = null;
  if (channelName === 'tutor-commands') webhookPath = 'tuition';
  if (channelName === 'homework-help')  webhookPath = 'student-tutor';
  if (channelName === 'fee-status')     webhookPath = 'parent-query';
  if (channelName === 'quizzes')        webhookPath = 'quiz-answer';

  if (!webhookPath) return;

  console.log(`Routing to: ${webhookPath}`);

  try {
    // Report command — skip Ollama entirely
    if (message.content.toLowerCase().startsWith('generate report')) {
      const parts       = message.content.trim().split(' ');
      const studentName = parts[2] || 'all';
      const payload = {
        intent:      'generate_report',
        studentName: studentName,
        authorId:    message.author.id,
        authorName:  message.author.username,
        channelId:   message.channel.id,
        today:       new Date().toISOString().split('T')[0]
      };
      console.log('Report requested for:', studentName);
      const response = await callN8N(payload, `${N8N_BASE_URL}/webhook/progress-report`);
      if (response.reply) await message.reply(response.reply);
      return;
    }

    // homework-help — quiz detection or student tutor
    if (channelName === 'homework-help') {
      const lower         = message.content.toLowerCase();
      const isQuizRequest = /quiz|test me|practice|examine/.test(lower);

      if (isQuizRequest) {
        const subjects = ['maths','math','english','science','physics',
                          'chemistry','biology','history','geography',
                          'urdu','computer','islamiat','ریاضی','انگریزی','سائنس'];
        let subject = 'General';
        for (const s of subjects) {
          if (lower.includes(s)) {
            subject = s.charAt(0).toUpperCase() + s.slice(1);
            break;
          }
        }

        const payload = {
          intent:      'generate_quiz',
          studentName: message.author.username,
          authorId:    message.author.id,
          subject:     subject,
          today:       new Date().toISOString().split('T')[0]
        };

        console.log(`Quiz request from ${message.author.username} on ${subject}`);
        const response = await callN8N(payload, `${N8N_BASE_URL}/webhook/quiz-generator`);

        if (response.quizId && response.questions) {
          try {
            const dmChannel = await message.author.createDM();
            await dmChannel.send(response.questions);
            await message.reply(`Check your DMs ${message.author.username}! Your ${subject} practice quiz is waiting 📝`);
            activeQuizzes[message.author.id] = {
              quizId:      response.quizId,
              subject:     subject,
              studentName: message.author.username
            };
          } catch(e) {
            console.error('DM error:', e.message);
            await message.reply('Could not send DM. Please enable DMs from server members in your Discord privacy settings.');
          }
        } else {
          await message.reply(response.reply || 'Could not generate quiz. Try again.');
        }
        return;
      }

      // Not a quiz — send to student tutor
      const payload = {
        content:     message.content,
        authorId:    message.author.id,
        authorName:  message.author.username,
        channelId:   message.channel.id,
        channelName: channelName
      };
      const response = await callN8N(payload, `${N8N_BASE_URL}/webhook/student-tutor`);
      if (response.reply) await message.reply(response.reply);
      return;
    }

    // Parent queries — skip Ollama
    if (webhookPath === 'parent-query') {
      const payload = {
        content:     message.content,
        authorId:    message.author.id,
        authorName:  message.author.username,
        channelId:   message.channel.id,
        channelName: channelName
      };
      console.log('Parent query:', payload.content);
      const response = await callN8N(payload, `${N8N_BASE_URL}/webhook/parent-query`);
      console.log('n8n response:', JSON.stringify(response));
      if (response.reply) await message.reply(response.reply);
      const logChannel = message.guild.channels.cache.find(c => c.name === 'bot-logs');
      if (logChannel) logChannel.send(`[${new Date().toLocaleTimeString()}] ${message.author.username} → parent-query`);
      return;
    }

    // All other channels — use Ollama for intent detection
    const intent = await callGroq(message.content);
    console.log('Groq response:', JSON.stringify(intent));

    const now     = new Date();
    const months  = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const payload = {
      ...intent,
      today:        now.toISOString().split('T')[0],
      currentMonth: months[now.getMonth()] + ' ' + now.getFullYear(),
      dueDate:      intent.dueDate || lastDay.toISOString().split('T')[0],
      studentId:    'S' + Date.now().toString().slice(-4),
      authorId:     message.author.id,
      authorName:   message.author.username,
      channelId:    message.channel.id,
      channelName:  channelName,
      webhookPath:  webhookPath
    };

    if (payload.name) {
      payload.firstName = payload.name.split(' ')[0];
      payload.grade     = 'Grade-' + String(payload.grade).replace(/[^0-9]/g, '');
    }

    const response = await callN8N(payload, `${N8N_BASE_URL}/webhook/` + webhookPath);
    console.log('n8n response:', JSON.stringify(response));

    if (response.reply) await message.reply(response.reply);

    const logChannel = message.guild.channels.cache.find(c => c.name === 'bot-logs');
    if (logChannel) {
      logChannel.send(`[${new Date().toLocaleTimeString()}] ${message.author.username} in #${channelName}: "${message.content.slice(0, 50)}" → intent: ${payload.intent}`);
    }

  } catch (err) {
    console.error('Error:', err.message);
    await message.reply('Something went wrong. Please try again.');
  }
});

client.login(TOKEN);