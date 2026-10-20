// 76 built-in actions (tài liệu 06, mục 4). Ids are stored inside saved prompts: never rename them.
// roles: o = opening, m = middle, e = ending. flags: b = bold; other letters are conditions (FLAGS).
// Text variables: {S} She/He, {s} she/he, {p} her/his, {g} the product. {p} is only ever possessive.

export const CATS = [
  { id: "pose", label: "Tạo dáng" },
  { id: "turn", label: "Xoay người" },
  { id: "move", label: "Di chuyển" },
  { id: "head", label: "Đầu & biểu cảm" },
  { id: "point", label: "Chỉ tay" },
  { id: "end", label: "Kết" },
  { id: "mine", label: "Của bạn" },
];

export const FLAGS = {
  P: { label: "bán áo", warn: "tay đút túi quần sẽ chạm vào quần. Chỉ dùng khi sản phẩm là áo." },
  W: { label: "cần tường", warn: "ảnh tham chiếu phải có tường ngay sau người mẫu." },
  C: { label: "cần ghế", warn: "ảnh tham chiếu phải có ghế." },
  S: { label: "cần bục", warn: "ảnh tham chiếu phải có bục thấp." },
  B: { label: "cần ảnh lưng", warn: "AI sẽ tự vẽ mặt sau sản phẩm. Đã tự bỏ “back view” khỏi negative." },
  H: { label: "không dùng cho mũ", warn: "tay gần đầu dễ làm méo mũ, nón." },
  T: { label: "chỉ cho mũ", warn: "chỉ dùng khi sản phẩm là mũ, nón." },
  X: { label: "chuyển cảnh", warn: "tay che ống kính ở cuối để ghép clip, chỉ dùng khi định nối clip." },
};

const A = (id, cat, roles, flags, label, text) => {
  const conds = flags.replace("b", "").split("").filter(Boolean);
  return { id, cat, roles, flags, bold: flags.includes("b"), conds, label, text };
};

export const ACTIONS = [
  // ---- Tạo dáng
  A("t1", "pose", "ome", "", "Đứng thẳng nhìn camera, thở nhẹ",
    "{S} stands tall facing the camera, arms relaxed at {p} sides, looks into the lens with a calm expression and breathes softly."),
  A("t9", "pose", "ome", "", "Dồn trọng tâm sang một chân, mỉm cười",
    "{S} gently shifts {p} weight onto one leg and smiles naturally at the camera, arms relaxed at {p} sides."),
  A("t7", "pose", "ome", "", "Hai tay buông tự nhiên",
    "{S} lets both arms hang loosely and naturally at {p} sides, shoulders relaxed, looking calmly into the camera."),
  A("t6", "pose", "ome", "", "Đặt hai tay ra sau lưng",
    "{S} slowly brings both hands behind {p} back and lightly clasps them there, chest open and posture tall, looking at the camera."),
  A("ob3", "pose", "ome", "b", "Vào dáng người mẫu: vai nghiêng, hơi ngẩng cằm",
    "{S} settles into a confident model pose, one shoulder angled slightly toward the camera and chin lifted a little, holding the pose with poise."),
  A("t2", "pose", "m", "", "Đứng nghiêng người 45°",
    "{S} turns to stand at about forty-five degrees to the camera and holds a relaxed pose that shows the {g} at an angle."),
  A("t3", "pose", "m", "b", "Đứng nghiêng 90° khoe dáng nghiêng, ống quần",
    "{S} turns ninety degrees to stand in full profile, showing the silhouette of the {g} and the line of the legs, and holds the pose."),
  A("t8", "pose", "me", "b", "Đứng bắt chéo chân",
    "{S} crosses one leg in front of the other in a relaxed standing pose, arms loose at {p} sides, and holds it with a confident look."),
  A("mb3", "pose", "m", "b", "Đổi liên tiếp hai dáng người mẫu",
    "{S} flows smoothly through two model poses in a row, first angling one shoulder toward the camera, then shifting {p} weight to the other leg with a slight turn of the hips, arms always away from the {g}."),
  A("t4", "pose", "ome", "P", "Một tay đút túi quần",
    "{S} slips one hand into {p} trouser pocket and relaxes into a casual pose, the other arm loose at {p} side."),
  A("t5", "pose", "oe", "P", "Hai tay đút túi quần",
    "{S} slips both hands into {p} trouser pockets and stands in a relaxed, casual pose, looking at the camera."),
  A("t10", "pose", "ome", "W", "Tựa lưng vào tường",
    "{S} leans back against the wall, {p} shoulders resting on it, arms relaxed away from the {g}, and looks into the camera."),
  A("t11", "pose", "ome", "W", "Tựa vai vào tường",
    "{S} leans one shoulder against the wall in a relaxed pose, arms loose away from the {g}, looking at the camera."),
  A("t12", "pose", "ome", "W", "Dựa một bên hông vào tường",
    "{S} rests one hip against the wall in a relaxed pose, weight on that side, arms loose away from the {g}."),
  A("t13", "pose", "ome", "C", "Ngồi trên ghế tạo dáng",
    "{S} sits on the chair in a poised fashion pose, back straight, hands resting on the edge of the seat away from the {g}."),
  A("t14", "pose", "ome", "C", "Ngồi vắt chéo chân",
    "{S} sits on the chair with one leg crossed over the other, posture elegant, hands resting lightly on the chair."),
  A("t15", "pose", "m", "C", "Ngồi hơi nghiêng người về trước",
    "{S} sits on the chair and leans slightly forward toward the camera with an engaged expression, hands resting on the edge of the seat."),
  A("t16", "pose", "ome", "C", "Ngồi tựa lưng thư giãn",
    "{S} sits back against the chair in a relaxed, comfortable pose, arms resting on the chair, looking at the camera."),

  // ---- Xoay người
  A("m3", "turn", "m", "", "Xoay 30° sang phải rồi quay lại",
    "{S} slowly turns {p} body about thirty degrees to {p} right, holds the pose for a moment, then slowly turns back to face the camera."),
  A("m4", "turn", "m", "", "Xoay 30° sang trái rồi quay lại",
    "{S} slowly turns {p} body about thirty degrees to {p} left, holds the pose for a moment, then slowly turns back to face the camera."),
  A("o3", "turn", "o", "", "Xoay nhẹ 30° rồi quay lại",
    "{S} slowly turns about thirty degrees to one side, holds for a moment, then turns back to face the camera."),
  A("r8", "turn", "m", "", "Xoay rồi dừng ở góc nghiêng",
    "{S} slowly turns {p} body to one side and stops at an angle, holding the pose to show the {g} in three-quarter view."),
  A("r9", "turn", "m", "", "Xoay nửa thân trên sang trái rồi phải",
    "{S} slowly rotates {p} upper body to the left, then smoothly to the right, hips steady, before returning to face the camera."),
  A("r11", "turn", "me", "", "Xoay người rồi nhìn thẳng vào camera",
    "{S} turns {p} body slightly to one side, then turns back and looks straight into the camera with a confident expression."),
  A("r12", "turn", "me", "", "Xoay người kết hợp bước lùi",
    "{S} turns {p} body gently to one side while taking a small step backward, then faces the camera again."),
  A("mb2", "turn", "m", "b", "Xoay 45° khoe dáng nghiêng, nhìn qua vai",
    "{S} turns {p} body about forty-five degrees to one side, showing the silhouette of the {g} in profile, glances back at the camera over {p} shoulder with a confident smile, holds the pose, then turns back to face the camera."),
  A("r4", "turn", "m", "b", "Xoay từ chính diện sang góc 90°",
    "{S} rotates smoothly from facing the camera to a full ninety-degree side profile, holds the pose, then turns back to face the camera."),
  A("r10", "turn", "m", "b", "Xoay người kết hợp bước chân",
    "{S} turns {p} body while stepping with the movement, one foot pivoting smoothly so the {g} moves naturally with {p} body, then faces the camera again."),
  A("r13", "turn", "m", "P", "Xoay người kết hợp đút tay vào túi",
    "{S} turns {p} body to one side while sliding one hand into {p} trouser pocket, then looks back at the camera."),
  A("r5", "turn", "m", "B", "Xoay 180° khoe mặt sau trang phục",
    "{S} slowly turns one hundred eighty degrees to show the back of the {g}, holds for a moment, then turns back to face the camera."),
  A("r6", "turn", "m", "B", "Xoay một vòng 360°",
    "{S} slowly turns a full circle in place, showing the {g} from every side, and comes back to face the camera."),
  A("r7", "turn", "m", "B", "Quay lưng về camera rồi nhìn qua vai",
    "{S} slowly turns {p} back to the camera, then glances over {p} shoulder at the lens with a soft smile."),

  // ---- Di chuyển
  A("m1", "move", "m", "", "Bước chậm 2–3 bước lại gần máy (khung nửa người)",
    "{S} takes two or three slow, steady steps toward the camera, arms relaxed at {p} sides, and stops gently in a waist-up medium shot."),
  A("d7", "move", "ome", "", "Bước một bước về phía trước",
    "{S} takes one slow, confident step forward toward the camera, arms relaxed at {p} sides."),
  A("d8", "move", "me", "", "Bước lùi một bước",
    "{S} takes one slow step backward and settles into a relaxed pose."),
  A("m8", "move", "me", "", "Lùi chậm về khung toàn thân",
    "{S} steps backward in small, smooth steps until {s} is framed full-body again."),
  A("d6", "move", "m", "", "Đi chậm rồi dừng lại",
    "{S} walks slowly for a few steps, arms swinging naturally away from the {g}, then stops gently in a relaxed pose."),
  A("d11", "move", "m", "", "Vừa đi vừa nhìn sang bên",
    "{S} walks slowly while glancing to the side, arms relaxed, then looks back at the camera."),
  A("d17", "move", "m", "", "Bước đi khoe độ rũ của quần, váy",
    "{S} walks slowly with long, relaxed strides so the fabric drapes and moves naturally with each step, arms away from the {g}."),
  A("ob1", "move", "o", "b", "Bước tự tin 1–2 bước tới máy, cười tươi",
    "{S} takes one or two confident steps toward the camera with a bright, self-assured smile, shoulders back and posture tall, arms swinging naturally away from the {g}."),
  A("mb1", "move", "m", "b", "Bước catwalk tới máy, dừng tạo dáng",
    "{S} walks toward the camera with a confident catwalk stride, one foot placed in front of the other, arms swinging naturally away from the {g}, and stops in a waist-up medium shot in a poised fashion pose."),
  A("d4", "move", "m", "b", "Đi ngang qua khung hình",
    "{S} walks across the frame from one side to the other with a confident stride, arms swinging naturally away from the {g}, then stops and faces the camera."),
  A("mb4", "move", "m", "b", "Đi chéo khung hình rồi quay lại nhìn máy",
    "{S} walks diagonally across the frame with a relaxed stride, then turns and looks back at the camera with a confident smile."),
  A("d12", "move", "m", "b", "Đi rồi quay đầu nhìn camera",
    "{S} walks a few steps, then turns {p} head to look into the camera with a confident smile while still moving."),
  A("d16", "move", "m", "b", "Đi bộ kết hợp xoay người",
    "{S} walks forward and turns {p} body smoothly mid-stride, showing the {g} from the side, then continues facing the camera."),
  A("d10", "move", "m", "P", "Đi bộ kết hợp đút tay vào túi",
    "{S} walks slowly with one hand slipped into {p} trouser pocket, the other arm relaxed."),
  A("d3", "move", "m", "B", "Đi ra xa camera rồi quay lại",
    "{S} turns and walks a few steps away from the camera, then turns around and walks back toward it."),
  A("d13", "move", "m", "B", "Đi vòng quanh một vị trí",
    "{S} walks slowly in a small circle around one spot, showing the {g} from all sides, and returns to face the camera."),
  A("d14", "move", "m", "S", "Bước lên bục rồi tạo dáng",
    "{S} steps up onto the low platform and settles into a confident fashion pose."),
  A("d18", "move", "m", "S", "Đặt một chân lên bục thấp",
    "{S} places one foot up on the low platform, posture tall, and holds a relaxed pose."),
  A("d15", "move", "m", "C", "Ngồi xuống ghế rồi đứng dậy",
    "{S} sits down on the chair smoothly, pauses for a moment, then stands back up gracefully."),

  // ---- Đầu & biểu cảm
  A("m9", "head", "ome", "", "Quay đầu chậm sang một bên rồi nhìn lại máy",
    "{S} slowly turns {p} head to one side, showing the {g} in profile, holds for a moment, then slowly turns back to look into the camera."),
  A("m5", "head", "ome", "", "Nghiêng đầu nhẹ, mỉm cười, giữ dáng",
    "{S} tilts {p} head slightly, smiles softly at the camera and holds the pose, breathing calmly."),
  A("h6", "head", "ome", "", "Cười tự nhiên nhìn camera",
    "{S} smiles naturally and warmly into the camera, eyes bright, holding a relaxed pose."),
  A("h4", "head", "m", "", "Nhìn xuống trang phục rồi ngẩng nhìn camera",
    "{S} glances down at the {g} with a pleased expression, then lifts {p} eyes back to the camera with a smile."),
  A("h5", "head", "me", "", "Nhìn qua vai",
    "{S} turns {p} head and glances over {p} shoulder with a soft, confident look."),
  A("h7", "head", "om", "", "Nhìn xa khỏi camera rồi nhìn lại",
    "{S} looks away from the camera into the distance for a moment, then slowly turns {p} gaze back to the lens."),
  A("h9", "head", "me", "", "Đưa tay chạm nhẹ vào cằm",
    "{S} raises one hand and lightly touches {p} chin in a thoughtful pose, the arm kept clear of the {g}, then lowers it."),
  A("ob2", "head", "om", "b", "Liếc sang bên rồi quay đầu nhìn thẳng máy",
    "{S} glances to one side, then turns {p} head to look straight into the camera with a confident, self-assured expression."),
  A("h8", "head", "me", "H", "Vuốt tóc bằng một tay",
    "{S} runs one hand slowly through {p} hair, the arm kept clear of the {g}, then lowers the hand."),

  // ---- Chỉ tay
  A("p1", "point", "m", "", "Chỉ tay nhẹ về phía sản phẩm rồi hạ tay",
    "{S} slowly raises one hand and gestures toward the {g} with an open palm, the hand staying a clear distance away and never touching it, holds for a moment, then slowly lowers the hand back to {p} side."),
  A("p2", "point", "m", "", "Nhìn máy mỉm cười, chỉ tay về sản phẩm",
    "{S} looks into the camera with a soft smile and gestures toward the {g} with one open hand held well away from it, never touching it, then slowly lowers the hand."),
  A("p3", "point", "m", "", "Hai tay mở ra giới thiệu sản phẩm",
    "{S} slowly brings both hands up in front of {p} body, palms open in a gentle presenting gesture toward the {g}, hands held well away from it and never touching it, then slowly lowers them."),
  A("p4", "point", "m", "", "Xoay nhẹ 30° kèm chỉ tay về sản phẩm",
    "{S} slowly turns about thirty degrees to one side while gesturing toward the {g} with one open hand held well away from it, never touching it, then turns back to face the camera and lowers the hand."),
  A("p5", "point", "m", "T", "Chỉ tay lên nón, mũ",
    "{S} slowly raises one hand and points up toward the headwear on {p} head, the fingertips staying a clear distance from it and never touching it, holds for a moment, then slowly lowers the hand."),
  A("eb2", "point", "me", "b", "Chỉ tay về phía máy (mời người xem)",
    "{S} points toward the camera with one hand in an inviting gesture, the arm kept clear of the {g}, with a confident smile."),
  A("eb3", "point", "e", "b", "Chỉ xuống góc dưới bên trái (giỏ hàng)",
    "{S} points down toward the bottom-left corner of the frame with one hand held well away from the {g}, smiling at the camera as if inviting viewers to the shopping cart."),

  // ---- Kết
  A("e1", "end", "e", "", "Lùi về toàn thân, về dáng khung đầu",
    "{S} steps backward in small, smooth steps to a full-body framing and settles into the same relaxed pose as the first frame."),
  A("e2", "end", "e", "", "Về đúng dáng khung đầu (để lặp mượt)",
    "{S} slowly returns to the exact same relaxed pose and position as the first frame, looking into the camera with a soft smile."),
  A("e5", "end", "e", "", "Đứng yên nhìn camera để kết thúc",
    "{S} stands still facing the camera with a calm, confident look to finish."),
  A("e3", "end", "e", "", "Đứng yên nửa giây cuối (để nối clip)",
    "{S} settles into a relaxed, natural pose facing the camera and holds completely still for the final half second, ready for the next clip."),
  A("eb1", "end", "e", "b", "Dáng chốt (hero pose), giữ yên 1 giây",
    "{S} settles into a confident hero pose, shoulders back and chin slightly lifted, and holds completely still for one second."),
  A("eb4", "end", "e", "b", "Vẫy tay chào, gật đầu cười tươi",
    "{S} waves one hand at the camera, the arm kept clear of the {g}, and nods with a bright smile."),
  A("eb5", "end", "e", "b", "Bước thêm một bước tới máy, gật đầu chốt",
    "{S} takes one more step toward the camera and gives a confident nod to close."),
  A("e4", "end", "e", "P", "Kết với một tay trong túi quần",
    "{S} finishes with one hand slipped into {p} trouser pocket in a relaxed pose."),
  A("e6", "end", "e", "X", "Đưa tay về phía camera (chuyển cảnh)",
    "{S} raises one hand toward the camera until the palm covers the lens, as a transition to the next clip."),
];

const ROLE_CODE = { open: "o", mid: "m", end: "e" };
export const ROLE_LABEL = { open: "Mở đầu", mid: "Đoạn giữa", end: "Kết" };

// Merges built-in and custom actions into one lookup.
export function buildIndex(customActions = []) {
  const custom = customActions.map((c) => ({
    id: c.id,
    cat: "mine",
    roles: ROLE_CODE[c.role] || "m",
    role: c.role,
    flags: "",
    bold: false,
    conds: [],
    label: c.label,
    text: c.text,
    custom: true,
  }));
  const all = [...ACTIONS, ...custom];
  const byId = new Map(all.map((a) => [a.id, a]));
  const forRole = (role) => all.filter((a) => a.roles.includes(ROLE_CODE[role]));
  return { all, byId, forRole, custom };
}

export const roleNames = (roles) =>
  [roles.includes("o") && "Mở", roles.includes("m") && "Giữa", roles.includes("e") && "Kết"].filter(Boolean).join(", ");
