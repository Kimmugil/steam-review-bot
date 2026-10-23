// 관리자 비밀번호의 "해시"를 만듭니다. 비밀번호 자체는 어디에도 저장되지 않습니다.
//   사용법: 프로젝트 폴더에서  node scripts/hash-password.mjs
//   나온 한 줄(scrypt:...)을 .env.local 의 ADMIN_PASSWORD_HASH= 뒤에 붙여 넣으세요. (Vercel 환경변수에도 같은 값)
//   SESSION_SECRET 에 쓸 임의의 긴 문자열도 같이 출력합니다.
import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const stdoutWrite = rl._writeToOutput;
rl.question("새 관리자 비밀번호 (입력 중에는 화면에 보이지 않습니다): ", (pw) => {
  rl._writeToOutput = stdoutWrite;
  rl.close();
  console.log("\n");
  if (pw.length < 10) {
    console.error("비밀번호는 10자 이상으로 정해 주세요. 길수록 안전합니다.");
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64).toString("hex");
  console.log("ADMIN_PASSWORD_HASH=scrypt:" + salt.toString("hex") + ":" + hash);
  console.log("SESSION_SECRET=" + randomBytes(32).toString("hex"));
});
rl._writeToOutput = (s) => {
  if (s.includes("새 관리자 비밀번호")) stdoutWrite.call(rl, s);
};
