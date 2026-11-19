import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);
const $ = id => document.getElementById(id);
let currentUser = null, currentProfile = null, isRegister = false, isAdmin = false, isTeacher = false;

function message(id, text, error=false){ const el=$(id); el.textContent=text; el.style.color=error?"#b3261e":"#287343"; }
function initials(name="XI.3"){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();}
function avatarUrl(name){return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=76232e&color=fff&size=200`;}
function dateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function safe(text=""){return String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

$("loginTab").onclick=()=>setAuthMode(false);
$("registerTab").onclick=()=>setAuthMode(true);
function setAuthMode(register){isRegister=register;$("loginTab").classList.toggle("active",!register);$("registerTab").classList.toggle("active",register);$("nameLabel").classList.toggle("hidden",!register);$("nameInput").required=register;$("authSubmit").textContent=register?"Buat akun":"Masuk";$("passwordInput").autocomplete=register?"new-password":"current-password";message("authMessage","");}
$("authForm").addEventListener("submit",async e=>{
 e.preventDefault(); const email=$("emailInput").value.trim(), password=$("passwordInput").value;
 try{
  if(isRegister){const name=$("nameInput").value.trim();if(!name)throw Error("Masukkan nama lengkap.");const cred=await createUserWithEmailAndPassword(auth,email,password);await setDoc(doc(db,"users",cred.user.uid),{name,email,className:"XI.3",studentNumber:null,photoURL:"",role:"student",createdAt:serverTimestamp()});}
  else await signInWithEmailAndPassword(auth,email,password);
 }catch(err){message("authMessage",friendlyError(err),true);}
});
$("logoutBtn").onclick=()=>signOut(auth);
function friendlyError(e){const map={"auth/email-already-in-use":"Email sudah terdaftar.","auth/invalid-email":"Format email tidak valid.","auth/weak-password":"Password minimal 6 karakter.","auth/invalid-credential":"Email atau password salah.","permission-denied":"Akses ditolak. Periksa Security Rules Firebase.","storage/unauthorized":"Tidak punya izin mengunggah file."};return map[e.code]||e.message||"Terjadi kesalahan.";}

onAuthStateChanged(auth,async user=>{
 currentUser=user;
 $("authView").classList.toggle("hidden",!!user);$("appView").classList.toggle("hidden",!user);$("logoutBtn").classList.toggle("hidden",!user);
 if(!user)return;
 try{
  const snap=await getDoc(doc(db,"users",user.uid));
  if(!snap.exists()){await signOut(auth);throw Error("Profil akun belum tersedia.");}
  currentProfile=snap.data();isAdmin=currentProfile.role==="admin";isTeacher=currentProfile.role==="teacher";
  document.querySelectorAll(".staff-only").forEach(el=>el.classList.toggle("hidden",!(isAdmin||isTeacher)));
  $("welcomeName").textContent=currentProfile.name||"Siswa";$("avatar").textContent=initials(currentProfile.name);
  $("profileName").textContent=currentProfile.name||"-";$("profileEmail").textContent=user.email||"-";
  $("profileNameInput").value=currentProfile.name||"";$("profileNumberInput").value=currentProfile.studentNumber||"";
  $("profilePhoto").src=currentProfile.photoURL||avatarUrl(currentProfile.name);
  await loadOwnAttendance();await loadToday();
 }catch(err){console.error(err);if(user)message("authMessage",friendlyError(err),true);}
});

document.querySelectorAll(".navbtn").forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.goto)));
function showPage(page){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));$("page-"+page).classList.remove("hidden");document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));if(page==="history")loadOwnAttendance();if(page==="students"&&(isAdmin||isTeacher))loadStudents();if(page==="admin"&&(isAdmin||isTeacher))loadAdminQueue();}

$("profileForm").addEventListener("submit",async e=>{
 e.preventDefault();try{
  const name=$("profileNameInput").value.trim(), number=Number($("profileNumberInput").value), file=$("profileFile").files[0];
  if(!name||!Number.isInteger(number)||number<1||number>60)throw Error("Isi nama dan nomor absen 1–60.");
  let photoURL=currentProfile.photoURL||"";
  if(file){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>2*1024*1024)throw Error("Foto harus JPG/PNG/WebP maksimal 2 MB.");const path=ref(storage,`profilePhotos/${currentUser.uid}/profile`);await uploadBytes(path,file);photoURL=await getDownloadURL(path);}
  await updateDoc(doc(db,"users",currentUser.uid),{name,studentNumber:number,photoURL});
  currentProfile={...currentProfile,name,studentNumber:number,photoURL};$("welcomeName").textContent=name;$("avatar").textContent=initials(name);$("profileName").textContent=name;$("profilePhoto").src=photoURL||avatarUrl(name);message("profileMessage","Profil berhasil diperbarui.");
 }catch(err){message("profileMessage",friendlyError(err),true);}
});

$("attendanceForm").addEventListener("submit",async e=>{
 e.preventDefault();try{
  const status=$("attendanceStatus").value,note=$("attendanceNote").value.trim(),file=$("evidenceFile").files[0];
  if(!status)throw Error("Pilih status kehadiran.");
  if(["Sakit","Izin"].includes(status)&&!file)throw Error("Unggah bukti untuk status sakit atau izin.");
  if(file&&(!["image/jpeg","image/png"].includes(file.type)||file.size>3*1024*1024))throw Error("Bukti harus JPG/PNG maksimal 3 MB.");
  const day=dateKey();const existing=await getDocs(query(collection(db,"attendance"),where("uid","==",currentUser.uid),where("dateKey","==",day)));
  if(!existing.empty)throw Error("Absensi hari ini sudah tercatat.");
  let evidenceURL="";
  if(file){const path=ref(storage,`evidence/${currentUser.uid}/${day}-${Date.now()}`);await uploadBytes(path,file);evidenceURL=await getDownloadURL(path);}
  await addDoc(collection(db,"attendance"),{uid:currentUser.uid,name:currentProfile.name,studentNumber:currentProfile.studentNumber||null,className:"XI.3",status,note,evidenceURL,dateKey:day,createdAt:serverTimestamp(),reviewStatus:status==="Hadir"?"tercatat":"menunggu"});
  message("attendanceMessage","Absensi berhasil dikirim.");$("attendanceForm").reset();await loadOwnAttendance();await loadToday();
 }catch(err){message("attendanceMessage",friendlyError(err),true);}
});

async function getOwnRecords(){const snap=await getDocs(query(collection(db,"attendance"),where("uid","==",currentUser.uid)));return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.dateKey||"").localeCompare(a.dateKey||""));}
async function loadOwnAttendance(){
 try{const rows=await getOwnRecords();$("statTotal").textContent=rows.length;$("statHadir").textContent=rows.filter(x=>x.status==="Hadir").length;$("statIzin").textContent=rows.filter(x=>x.status==="Izin").length;$("statSakit").textContent=rows.filter(x=>x.status==="Sakit").length;
 $("historyList").innerHTML=rows.length?table(["Tanggal","Status","Keterangan","Bukti"],rows.map(r=>[safe(r.dateKey),`<span class="pill">${safe(r.status)}</span>`,safe(r.reviewStatus||"-"),r.evidenceURL?`<a href="${safe(r.evidenceURL)}" target="_blank" rel="noopener">Lihat bukti</a>`:"-"])):'<div class="empty">Belum ada riwayat absensi.</div>';
 }catch(e){$("historyList").textContent=friendlyError(e);}
}
async function loadToday(){try{const rows=await getOwnRecords(),r=rows.find(x=>x.dateKey===dateKey());$("todayStatus").textContent=r?`Status hari ini: ${r.status} · ${r.reviewStatus||"tercatat"}`:"Belum ada catatan absensi hari ini.";}catch(e){console.error(e);}}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;}

async function loadStudents(){try{const snap=await getDocs(collection(db,"users"));const rows=snap.docs.map(d=>d.data()).filter(u=>u.className==="XI.3").sort((a,b)=>(a.studentNumber||99)-(b.studentNumber||99)).map(u=>[safe(u.studentNumber||"-"),safe(u.name||"-"),safe(u.email||"-"),safe(u.role||"student")]);$("studentsList").innerHTML=rows.length?table(["No. absen","Nama","Email","Peran"],rows):'<div class="empty">Belum ada siswa terdaftar.</div>';}catch(e){$("studentsList").textContent=friendlyError(e);}}
async function loadAdminQueue(){try{const snap=await getDocs(collection(db,"attendance"));const rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>["Izin","Sakit"].includes(r.status)).sort((a,b)=>(b.dateKey||"").localeCompare(a.dateKey||""));$("adminList").innerHTML=rows.length?table(["Tanggal","Siswa","Status","Bukti","Tindakan"],rows.map(r=>[safe(r.dateKey),safe(r.name),safe(r.status),r.evidenceURL?`<a href="${safe(r.evidenceURL)}" target="_blank" rel="noopener">Lihat</a>`:"-",`<button class="primary review-btn" data-id="${safe(r.id)}">Tandai ditinjau</button>`])):'<div class="empty">Belum ada pengajuan sakit/izin.</div>';document.querySelectorAll(".review-btn").forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,"attendance",b.dataset.id),{reviewStatus:"ditinjau"});await loadAdminQueue();}catch(e){alert(friendlyError(e));}});}catch(e){$("adminList").textContent=friendlyError(e);}}
