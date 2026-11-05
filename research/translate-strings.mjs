// One-shot translation: Bengali -> English across API routes and lib helpers
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '/home/z/my-project/src'

// Ordered longest-first to avoid partial overlaps
const MAP = [
  ['সেশনের সময় শেষ — উপস্থিতি নেওয়া হয়ে গেছে', 'The session window has ended — attendance is closed'],
  ['লোকেশন পাওয়া যায়নি — GPS যাচাই ছাড়া সেশন চালু হলো', 'Location unavailable — session started without GPS verification'],
  ['চেক-ইন হয়েছে, তবে কিছু বিষয় যাচাইয়ের জন্য ফ্ল্যাগ হয়েছে ⚠️', 'Checked in, but some items were flagged for review'],
  ['উপস্থিতি সফলভাবে রেকর্ড হয়েছে ✅', 'Attendance recorded successfully'],
  ['আপনার উপস্থিতি আগেই রেকর্ড হয়েছে ✅', 'Your attendance was already recorded'],
  ['এই কোডে কোনো ক্লাস পাওয়া যায়নি', 'No class found for this code'],
  ['শুধু শিক্ষার্থী চেক-ইন করতে পারে', 'Only students can check in'],
  ['শুধু শিক্ষার্থী ক্লাসে যুক্ত হতে পারে', 'Only students can join classes'],
  ['শুধু শিক্ষক সেশন শুরু করতে পারেন', 'Only teachers can start sessions'],
  ['শুধু শিক্ষক স্টুডেন্ট যোগ করতে পারেন', 'Only teachers can add students'],
  ['শুধু শিক্ষক ক্লাস তৈরি করতে পারেন', 'Only teachers can create classes'],
  ['আপনি এই ক্লাসের শিক্ষার্থী নন', 'You are not a student of this class'],
  ['এই সেশনের শিক্ষক আপনি নন', 'You are not the teacher of this session'],
  ['এই ক্লাসের শিক্ষক আপনি নন', 'You are not the teacher of this class'],
  ['কোড যাচাই ব্যর্থ (ভুল বা পুরনো)', 'Code verification failed (wrong or expired)'],
  ['GPS পাওয়া যায়নি (পারমিশন দিন)', 'GPS unavailable (grant location permission)'],
  ['ক্লাসরুমের রেঞ্জের বাইরে (~', 'Outside classroom range (~'],
  [' মিটার)', ' m)'],
  ['নতুন/ভিন্ন ডিভাইস থেকে চেক-ইন', 'Check-in from a new/different device'],
  ['স্টুডেন্ট ও স্ট্যাটাস দিন (PRESENT/FLAGGED/ABSENT)', 'Provide studentId and status (PRESENT/FLAGGED/ABSENT)'],
  ['কমপক্ষে একজন স্টুডেন্টের নাম ও ফোন দিন', 'Provide at least one student name and phone'],
  ['সঠিক ফোন নম্বর দিন (শুধু ডিজিট)', 'Enter a valid phone number (digits only)'],
  ['শুধু শিক্ষকের জন্য', 'Teachers only'],
  ['সেশন পাওয়া যায়নি', 'Session not found'],
  ['ক্লাস পাওয়া যায়নি', 'Class not found'],
  ['সেশন আইডি দরকার', 'Session ID required'],
  ['ডিভাইস আইডি দরকার', 'Device ID required'],
  ['ক্লাসের নাম দিন', 'Provide a class name'],
  ['ক্লাস কোড দিন', 'Enter the class code'],
  ['লগইন ব্যর্থ হয়েছে', 'Sign in failed'],
  ['নাম লিখুন', 'Enter your name'],
  ['ইতিমধ্যে একটি সক্রিয় সেশন আছে', 'A session is already active'],
  ['লগইন প্রয়োজন', 'Sign in required'],
  ['অনুমতি নেই', 'Not allowed'],
  ['সমস্যা হয়েছে', 'Something went wrong'],
]

const targets = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(name)) targets.push(p)
  }
}
walk(join(ROOT, 'app/api'))
walk(join(ROOT, 'lib'))

let changed = 0
for (const file of targets) {
  let src = readFileSync(file, 'utf8')
  const before = src
  for (const [bn, en] of MAP) src = src.split(bn).join(en)
  if (src !== before) {
    writeFileSync(file, src)
    changed++
    console.log('updated:', file)
  }
}
console.log(`done — ${changed} file(s) updated`)

// Verify no Bengali remains
import { execSync } from 'node:child_process'
try {
  const out = execSync(`rg -l '[ঀ-৿]' ${ROOT}/app/api ${ROOT}/lib || true`, { encoding: 'utf8' })
  console.log('remaining Bengali files:', out.trim() || '(none)')
} catch {}
