"use strict";
import express from "express";
import fs from "node:fs/promises";
import { engine } from "express-handlebars";
import session from "express-session";
import { auth } from "./middleware/auth.js";
import multer from "multer";

const app = express();
const uploadsDir = "./uploads";
const storage = multer.diskStorage({
  destination: async (req, file, next) => {
    try {
      await fs.access(uploadsDir);
    } catch {
      await fs.mkdir(uploadsDir);
    }
    next(null, "./uploads");
  },
  filename: (req, file, next) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1);
    const nameParts = file.originalname.split(".");
    next(null, uniqueSuffix + "." + nameParts[nameParts.length - 1]);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, next) => {
    const allowed = ["image/gif", "image/jpeg", "image/png", "image/webp", "image/svg+xml"];
    if (allowed.includes(file.mimetype)) {
      next(null, true);
    }
    console.log(file.mimetype);
  },
});
const file = "./database.json";

// app.set('trust proxy', 1);

//Sesijos duomenų konfigūracija
app.use(
  session({
    secret: "LABAI SLAPTA FRAZĖ",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

//Konfigūracinė eilutė kuri yra būtina norint POST metodu priimti duomenis
app.use(
  express.urlencoded({
    extended: true,
  })
);

//handlebars konfigūracija
app.engine("handlebars", engine());
app.set("view engine", "handlebars");
app.set("views", "./views");

//Prisijungimo forma
app.get("/login", (req, res) => {
  res.render("login");
});

//Prisijungimo duomenų tikrinimas
app.post("/login", async (req, res) => {
  let data = JSON.parse(await fs.readFile(file, "utf-8"));

  data = data.filter((user) => user.email === req.body.email && user.password === req.body.password);
  if (data.length > 0) {
    req.session.loggedIn = true;
    req.session.user = {
      name: data[0].name,
      last_name: data[0].last_name,
      email: data[0].email,
    };
    data[0].user;
    return res.redirect("/");
  }

  res.redirect("/login");
});

//Visų vartotojų sąrašas
app.get("/", auth, async (req, res) => {
  let data = JSON.parse(await fs.readFile(file, "utf8"));
  data = data.map((user) => {
    if (user.email === req.session.user.email) {
      user.current = "true";
    }
    return user;
  });

  res.render("admin", {
    user: req.session.user,
    message: req.session.message,
    data,
  });
  delete req.session.message;
});

//Naujo vartotojo forma
app.get("/new-user", auth, (req, res) => {
  res.render("newuser", {
    user: req.session.user,
    message: req.session.message,
  });

  delete req.session.message;
});

//Naujo varotojo išsaugojimas
//patikrinti failo formata
//priskirti formato pavadima, ekstensiona
//issaugoti failo pavadinima
app.post("/new-user", auth, upload.single("photo"), async (req, res) => {
  console.log(req.file.path.replace("\\", "/")); //or files jeigu daugiskaita, ne single upload
  if (req.file) {
    req.body.photo = req.file.path.replace("\\", "/");
  }
  try {
    let data = JSON.parse(await fs.readFile(file, "utf-8"));

    if (data.find((user) => user.email === req.body.email)) {
      req.session.message = "Vartotojas tokiu el. pašto adresu jau registruotas";
      return res.redirect("/new-user");
    }

    data.push(req.body);
    await fs.writeFile(file, JSON.stringify(data));
  } catch {
    await fs.writeFile(file, JSON.stringify([req.body]));
  }

  res.redirect("/");
});

app.get("/delete-user/:id", auth, async (req, res) => {
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  ///cia padariau is pradziu kad neleistu istrinti , bet paskui padariau kad net nerodytu mygtuko istrynimo, tai sitas kaip ir nebereikalingas gal..
  if (req.session.user.email === data[req.params.id].email) {
    req.session.message = "Deja negalite ištrinti saves, kreipkitės i kita admiministratorių";
    return res.redirect("/");
  }

  data.splice(req.params.id, 1);
  await fs.writeFile(file, JSON.stringify(data));

  res.redirect("/");
});
app.get("/edit-user/:id", auth, async (req, res) => {
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  let user = data[req.params.id];
  let message = req.session.message;
  let formPrefills = req.session.formPrefills;
  delete req.session.message;
  delete req.session.formPrefills;
  res.render("edit", { formPrefills: formPrefills || user, id: req.params.id, message });
});

app.post("/edit-user", auth, async (req, res) => {
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  let name = req.body.name;
  let last_name = req.body.last_name;
  let current_email = req.body.current_email;
  let email = req.body.email;
  let password = req.body.password;
  let user = { name, last_name, email, password };
  if (email !== current_email) {
    //reiskia email nekaiciamas ir jei ziuretume ar toks egzistuoja, jis egzistuotu
    let alreadyExists = data.find((user) => user.email === email);
    if (alreadyExists) {
      req.session.message = "Vartotojas su tokiu elektroninio pasto adresu, jau egzituoja.";
      req.session.formPrefills = { name, last_name, email: current_email, password };
      return res.redirect(`/edit-user/${req.body.id}`); //forma resetinasi..nelabai gerai.. nezinau kaip uzpilyd per redirekta..
    }
  }
  data[req.body.id] = user;
  await fs.writeFile(file, JSON.stringify(data));
  if (req.body.current_email === req.session.user.email) {
    req.session.user = { name, last_name, email };
  }
  res.redirect("/");
});
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.listen(3000);
