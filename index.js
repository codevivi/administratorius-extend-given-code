"use strict";
import express from "express";
import fs from "node:fs/promises";
import { engine } from "express-handlebars";
import session from "express-session";
import { auth } from "./middleware/auth.js";
import multer from "multer";

const app = express();
const uploadsDir = "./uploads";
const file = "./database.json";
const gallery = "./gallery.json";
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
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9); //1e9-one billion
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
  },
});

// app.set('trust proxy', 1);

//Sesijos duomenų konfigūracija
app.use(
  session({
    secret: "LABAI SLAPTA FRAZĖ",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

//Konfigūracinė eilutė kuri yra būtina norint POST metodu priimti duomenis
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use("/uploads", express.static("./uploads"));

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

  const index = data.findIndex((user) => user.email === req.body.email && user.password === req.body.password);
  if (index != -1) {
    req.session.loggedIn = true;
    req.session.user = {
      id: index,
      name: data[index].name,
      last_name: data[index].last_name,
      email: data[index].email,
    };
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
app.post("/new-user", auth, upload.single("photo"), async (req, res) => {
  if (req.file) {
    req.body.photo = req.file.path.replace("\\", "/"); //files jeigu daugiskaita, ne single upload
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
  res.render("edit", { formPrefills: formPrefills || user, user, id: req.params.id, message });
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
    //Tikrinti ti tuo atveju, jei email reiksmes nebuvo bandoma pakeisti, nes jei ziuretume ar toks egzistuoja, jis egzistuotu
    let alreadyExists = data.find((user) => user.email === email);
    if (alreadyExists) {
      req.session.message = "Vartotojas su tokiu elektroninio pasto adresu, jau egzituoja.";
      req.session.formPrefills = { name, last_name, email: current_email, password };
      return res.redirect(`/edit-user/${req.body.id}`);
    }
  }
  data[req.body.id] = user;
  await fs.writeFile(file, JSON.stringify(data));
  if (req.body.current_email === req.session.user.email) {
    req.session.user = { name, last_name, email };
  }
  res.redirect("/");
});

app.get("/new-photo", auth, (req, res) => {
  res.render("newphoto", { user: req.session.user, message: req.session.message });
  delete req.session.message;
});

app.post("/new-photo", auth, upload.single("photo"), async (req, res) => {
  if (req.file) req.body.photo = req.file.path.replace("\\", "/");

  // const users = JSON.parse(await fs.readFile(file, 'utf-8'));
  // req.body.userId = users.findIndex(user => user.email === req.session.user.email);
  req.body.userId = req.session.user.id;

  try {
    let data = JSON.parse(await fs.readFile(gallery, "utf-8"));

    data.push(req.body);
    await fs.writeFile(gallery, JSON.stringify(data));
  } catch {
    await fs.writeFile(gallery, JSON.stringify([req.body]));
  }

  res.redirect("/");
});

app.get("/gallery", auth, async (req, res) => {
  const galleryData = JSON.parse(await fs.readFile(gallery, "utf-8"));
  const userData = JSON.parse(await fs.readFile(file, "utf-8"));

  for (const i in galleryData) {
    const userInfo = userData[galleryData[i].userId];
    galleryData[i].userInfo = userInfo;

    if (galleryData[i].ratings) {
      let alreadyRated = galleryData[i].ratings.find((rating) => {
        return rating.userId === req.session.user.id;
      });
      if (alreadyRated) {
        galleryData[i].alreadyRated = alreadyRated.rating;
      }

      const sum = galleryData[i].ratings.reduce((prev, current) => prev + current.rating, 0);
      galleryData[i].totalRating = (sum / galleryData[i].ratings.length).toFixed(2);
    }
  }
  galleryData.sort((currentPicture, nextPicture) => {
    return nextPicture.totalRating - currentPicture.totalRating;
  });
  res.render("gallery", { data: galleryData, user: req.session.user, message: req.session.message });
  delete req.session.message;
});

app.post("/gallery/:id", auth, async (req, res) => {
  // req.params.id
  const galleryData = JSON.parse(await fs.readFile(gallery, "utf-8"));
  const ratingData = {
    rating: +req.body.rating,
    userId: req.session.user.id,
  };

  if (!galleryData[req.params.id].ratings) {
    galleryData[req.params.id].ratings = [ratingData];
  } else {
    const alreadyRated = galleryData[req.params.id].ratings.find((rating) => {
      return rating.userId === req.session.user.id;
    });
    if (alreadyRated) {
      req.session.message = `Jau ivertinote: ${alreadyRated.rating}`;
      return res.redirect("/gallery");
    }
    galleryData[req.params.id].ratings.push(ratingData);
  }

  await fs.writeFile(gallery, JSON.stringify(galleryData));

  res.redirect("/gallery");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.listen(3000, () => {
  console.log("server is running on port 3000");
});
