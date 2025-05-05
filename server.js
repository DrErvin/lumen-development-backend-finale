require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { readFile, writeFile } = require("fs");
const path = require("path");
const fs = require("fs");
const transporter = require("./email.js");
const multer = require("multer");

// Import Supabase client library
const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client with environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const uploadsDir = path.join(__dirname, "uploads");

// Check if the directory exists, and if not, create it
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("Uploads directory created");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Specify the uploads folder
  },
  filename: (req, file, cb) => {
    // Preserve the original filename
    const uniqueSuffix = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}`;
    const originalName = file.originalname;
    cb(null, `${uniqueSuffix}-${originalName}`); // Append timestamp to avoid overwriting
  },
});
const upload = multer({ storage: storage }); // Temporary directory for uploaded files

const app = express();
const PORT = process.env.PORT || 3000; // Choose a port number

app.use(cors());
app.use(express.json()); // Use express.json() for parsing JSON bodies

// File paths to the JSON data
const OPPORTUNITIES_FILE = path.join(
  __dirname,
  "opportunityData.json"
);
const ACCOUNTS_FILE = path.join(__dirname, "accountData.json");
const APPLICATIONS_FILE = path.join(
  __dirname,
  "applicationsData.json"
);
const WU_FILE = path.join(
  __dirname,
  "world_universities_and_domains.json"
);

// Default route for '/'
app.get("/", (req, res) => {
  res.send(
    "Welcome to the API. Use /opportunities, /accounts, /applications, /smart-search or /world-universities to fetch data."
  );
});

// GET endpoint to fetch all opportunities
// app.get("/opportunities1", (req, res) => {
//   readFile(OPPORTUNITIES_FILE, "utf8", (err, data) => {
//     if (err) {
//       console.error("Error reading file:", err);
//       return res.status(500).send("Error reading data");
//     }
//     res.json(JSON.parse(data));
//   });
// });

// Sign-up: triggers Supabase to send a confirmation email
app.post("/auth/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signUp(
      { email, password }
      // { redirectTo: `${process.env.FRONTEND_URL}/auth/callback` }
    );
    if (error) return res.status(400).json({ error: error.message });
    return res.json({
      message: "Confirmation email sent. Please check your inbox.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected error" });
  }
});

// Login: returns a JWT session if the email has been confirmed
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return res.status(401).json({ error: error.message });
    // `data.session` contains access_token, refresh_token, user, etc.
    return res.json({ session: data.session, user: data.user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected error" });
  }
});

// GET endpoint to fetch all opportunities
app.get("/opportunities", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("Error fetching opportunities:", error);
      return res.status(500).json({ error: error.message });
    }

    // Map over each record to parse JSON fields conditionally
    const parsedData = data.map((item) => {
      // Clone the record so we don't mutate the original object
      const parsedItem = { ...item };

      const parseIfJSON = (field) => {
        if (typeof field === "string") {
          const trimmed = field.trim();
          // Check if the string looks like a JSON array or object
          if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
            try {
              return JSON.parse(trimmed);
            } catch (err) {
              console.error(`Error parsing JSON field:`, err);
              // Return the original value if parsing fails
            }
          }
        }
        return field;
      };

      parsedItem.qualificationsAndRequirements = parseIfJSON(
        parsedItem.qualificationsAndRequirements
      );
      parsedItem.tags = parseIfJSON(parsedItem.tags);
      parsedItem.benefits = parseIfJSON(parsedItem.benefits);
      parsedItem.experienceRequired = parseIfJSON(
        parsedItem.experienceRequired
      );

      return parsedItem;
    });

    res.json(parsedData);
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST endpoint to add a new opportunity
// app.post("/opportunities", (req, res) => {
//   readFile(OPPORTUNITIES_FILE, "utf8", (err, data) => {
//     if (err) {
//       console.error("Error reading file:", err);
//       return res.status(500).json({
//         status: "error",
//         message: "Error reading data file.",
//       });
//     }

//     try {
//       const opportunities = JSON.parse(data);
//       const newOpportunity = req.body;
//       opportunities.push(newOpportunity);

//       writeFile(
//         OPPORTUNITIES_FILE,
//         JSON.stringify(opportunities, null, 2),
//         (writeErr) => {
//           if (writeErr) {
//             console.error("Error writing file:", writeErr);
//             return res.status(500).json({
//               status: "error",
//               message: "Error saving opportunity data.",
//             });
//           }

//           res.status(201).json({
//             status: "success",
//             data: newOpportunity,
//           });
//         }
//       );
//     } catch (parseErr) {
//       console.error("Error parsing JSON:", parseErr);
//       res.status(500).json({
//         status: "error",
//         message: "Error parsing data file.",
//       });
//     }
//   });
// });

// POST endpoint to add a new opportunity using Supabase
app.post("/opportunities", async (req, res) => {
  try {
    // Get the new opportunity data from the request body
    let newOpportunity = req.body;

    // Convert array fields to JSON strings if necessary
    if (
      newOpportunity.qualificationsAndRequirements &&
      Array.isArray(newOpportunity.qualificationsAndRequirements)
    ) {
      newOpportunity.qualificationsAndRequirements = JSON.stringify(
        newOpportunity.qualificationsAndRequirements
      );
    }
    if (newOpportunity.tags && Array.isArray(newOpportunity.tags)) {
      newOpportunity.tags = JSON.stringify(newOpportunity.tags);
    }
    if (
      newOpportunity.benefits &&
      Array.isArray(newOpportunity.benefits)
    ) {
      newOpportunity.benefits = JSON.stringify(
        newOpportunity.benefits
      );
    }
    if (
      newOpportunity.experienceRequired &&
      Array.isArray(newOpportunity.experienceRequired)
    ) {
      newOpportunity.experienceRequired = JSON.stringify(
        newOpportunity.experienceRequired
      );
    }

    // Insert the new opportunity into the "opportunities" table
    const { data, error } = await supabase
      .from("opportunities")
      .insert(newOpportunity)
      .single(); // .single() returns the inserted record

    if (error) {
      console.error("Error inserting opportunity:", error);
      return res
        .status(500)
        .json({ status: "error", message: error.message });
    }

    // Helper function to conditionally parse JSON fields
    const parseIfJSON = (field) => {
      if (typeof field === "string") {
        const trimmed = field.trim();
        // Check if the string looks like a JSON array or object
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          try {
            return JSON.parse(trimmed);
          } catch (err) {
            console.error("Error parsing JSON field:", err);
            // Fall back to the original value if parsing fails
          }
        }
      }
      return field;
    };

    // Parse the inserted record using the same logic as GET endpoint
    const parsedOpportunity = {
      ...newOpportunity,
      qualificationsAndRequirements: parseIfJSON(
        newOpportunity.qualificationsAndRequirements
      ),
      tags: parseIfJSON(newOpportunity.tags),
      benefits: parseIfJSON(newOpportunity.benefits),
      experienceRequired: parseIfJSON(
        newOpportunity.experienceRequired
      ),
    };

    res
      .status(201)
      .json({ status: "success", newOpportunity: parsedOpportunity });
  } catch (err) {
    console.error("Unexpected error inserting opportunity:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// GET endpoint to fetch all accounts
// app.get("/accounts1", (req, res) => {
//   readFile(ACCOUNTS_FILE, "utf8", (err, data) => {
//     if (err) {
//       console.error("Error reading file:", err);
//       return res.status(500).send("Error reading data");
//     }
//     res.json(JSON.parse(data));
//   });
// });

app.get("/accounts", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("accounts")
      .select("*");
    if (error) {
      console.error("Error fetching accounts:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error("Unexpected error fetching accounts:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST endpoint to add a new account
// app.post("/accounts", (req, res) => {
//   readFile(ACCOUNTS_FILE, "utf8", (err, data) => {
//     if (err) {
//       console.error("Error reading file:", err);
//       return res.status(500).json({
//         status: "error",
//         message: "Error reading data file.",
//       });
//     }

//     try {
//       const accounts = JSON.parse(data);
//       const newAccount = req.body;

//       // Add the new account to the array
//       accounts.push(newAccount);

//       // Write the updated accounts array back to the file
//       writeFile(
//         ACCOUNTS_FILE,
//         JSON.stringify(accounts, null, 2),
//         (writeErr) => {
//           if (writeErr) {
//             console.error("Error writing file:", writeErr);
//             return res.status(500).json({
//               status: "error",
//               message: "Error saving account data.",
//             });
//           }

//           res.status(201).json({
//             status: "success",
//             data: newAccount,
//           });
//         }
//       );
//     } catch (parseErr) {
//       console.error("Error parsing JSON:", parseErr);
//       res.status(500).json({
//         status: "error",
//         message: "Error parsing data file.",
//       });
//     }
//   });
// });

app.post("/accounts", async (req, res) => {
  try {
    const newAccount = req.body;
    const { data, error } = await supabase
      .from("accounts")
      .insert(newAccount)
      .single();
    if (error) {
      console.error("Error inserting account:", error);
      return res
        .status(500)
        .json({ status: "error", message: error.message });
    }
    res.status(201).json({ status: "success", data: newAccount });
  } catch (err) {
    console.error("Unexpected error inserting account:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

const readJSONFile = async (filePath) => {
  return new Promise((resolve, reject) => {
    readFile(filePath, "utf-8", (err, data) => {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(data));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
};

// GET endpoint to fetch all applications
// app.get("/applications1", (req, res) => {
//   readFile(APPLICATIONS_FILE, "utf8", (err, data) => {
//     if (err) {
//       console.error("Error reading applications file:", err);
//       return res.status(500).send("Error reading applications data");
//     }
//     res.json(JSON.parse(data));
//   });
// });

app.get("/applications", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("applications")
      .select("*");
    if (error) {
      console.error("Error fetching applications:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error("Unexpected error fetching applications:", err);
    res.status(500).json({ error: err.message });
  }
});

// app.post(
//   "/applications",
//   upload.single("cvUpload"),
//   async (req, res) => {
//     try {
//       const { userId, opportunityId } = req.body;
//       const file = req.file; // Access the uploaded file
//       console.log("Received application data:", {
//         userId,
//         opportunityId,
//       });

//       const date = new Date();
//       const applicationDate = date.toISOString().split("T")[0];
//       // Generate application data
//       const newApplication = {
//         application_id: `${Date.now()}`,
//         user_id: userId,
//         opportunity_id: opportunityId,
//         application_date: applicationDate,
//       };

//       // Read existing applications from file
//       readFile(APPLICATIONS_FILE, "utf8", (err, data) => {
//         const applications = err ? [] : JSON.parse(data);

//         // Add the new application
//         applications.push(newApplication);

//         // Write back the updated applications array
//         writeFile(
//           APPLICATIONS_FILE,
//           JSON.stringify(applications, null, 2),
//           (writeErr) => {
//             if (writeErr) {
//               console.error(
//                 "Error writing to applications file:",
//                 writeErr
//               );
//               return res.status(500).json({
//                 status: "error",
//                 message: "Failed to save application data.",
//               });
//             }

//             console.log(
//               "Application saved successfully:",
//               newApplication
//             );
//           }
//         );
//       });

//       // Fetch user and opportunity data
//       const accounts = await readJSONFile(ACCOUNTS_FILE);
//       const user = accounts.find((account) => account.id === userId);
//       if (!user)
//         return res.status(404).json({ error: "User not found" });

//       const opportunities = await readJSONFile(OPPORTUNITIES_FILE);
//       const opportunity = opportunities.find(
//         (opp) => opp.id == opportunityId
//       );
//       if (!opportunity || !opportunity.contactPersonEmail) {
//         return res
//           .status(404)
//           .json({ error: "Opportunity or contact email not found" });
//       }

//       const studentName = user.name_and_surname;
//       const studentEmail = user.email;
//       const universityName = user.university_name || "N/A";
//       const universityLocation = user.university_location || "N/A";
//       const companyEmail = opportunity.contactPersonEmail;
//       const opportunityTitle = opportunity.title;

//       // Email to Company employee
//       const companyMailOptions = {
//         from: "noreply.company.student.platform@gmail.com",
//         to: companyEmail,
//         subject: `New Application for ${opportunityTitle} through the Student Platform`,
//         html: `<h1>New Application Received</h1>
//         <h3>${studentName} has applied for <b>${opportunityTitle}</b> opportunity.</h3>
//         <p><b>Applicant:</b> ${studentName} (${studentEmail})</p>
//         <p><b>University:</b> ${universityName}, ${universityLocation}</p>
//         <p><b>Note:</b> If provided, CV will be attached</p>`,
//         attachments: file
//           ? [{ path: file.path, filename: file.originalname }]
//           : [],
//       };

//       // Email to student
//       const studentMailOptions = {
//         from: "noreply.company.student.platform@gmail.com",
//         to: studentEmail,
//         subject: `Application Confirmation for ${opportunityTitle}`,
//         html: `<h1>Application Confirmation</h1>
//         <h3>Thank you for applying for <b>${opportunityTitle} opportunity</b>.</h3>
//         <p><b>Opportunity:</b> ${opportunityTitle}</p>
//         <p><b>Contact Person Email:</b> ${companyEmail}</p>
//         <p><b>Your Name:</b> ${studentName}</p>
//         <p><b>Your Email:</b> ${studentEmail}</p>
//         <p><b>University:</b> ${universityName}, ${universityLocation}</p>`,
//         attachments: file
//           ? [{ path: file.path, filename: file.originalname }]
//           : [],
//       };

//       // Send emails
//       console.log("Sending emails...");
//       await transporter.sendMail(companyMailOptions);
//       await transporter.sendMail(studentMailOptions);

//       // Cleanup: Delete the uploaded file
//       if (file) {
//         const fs = require("fs");
//         fs.unlink(file.path, (err) => {
//           if (err) console.error("Failed to delete file:", err);
//         });
//       }

//       res.status(200).json({ message: "Emails sent successfully!" });
//       console.log(
//         "Email sent succesfully!\nApplication processed successfully!"
//       );
//     } catch (error) {
//       console.error("Error handling application:", error);
//       res
//         .status(500)
//         .json({ error: "Error processing the application" });
//     }
//   }
// );

app.post(
  "/applications",
  upload.single("cvUpload"),
  async (req, res) => {
    try {
      const { userId, opportunityId } = req.body;
      const file = req.file; // Optional file upload (e.g., CV)
      console.log("Received application data:", {
        userId,
        opportunityId,
      });

      const date = new Date();
      const applicationDate = date.toISOString().split("T")[0];

      // Create a new application object. Adjust fields as needed.
      const newApplication = {
        // Depending on your schema, you might let Supabase auto-generate an ID.
        application_id: `${Date.now()}`, // or omit if using auto-increment
        user_id: userId,
        opportunity_id: opportunityId,
        application_date: applicationDate,
      };

      // Insert the new application into the "applications" table
      const { data: insertedApplication, error: insertError } =
        await supabase
          .from("applications")
          .insert(newApplication, { returning: "representation" })
          .single();

      if (insertError) {
        console.error("Error inserting application:", insertError);
        return res.status(500).json({ error: insertError.message });
      }

      // Retrieve account data for the given user
      const { data: accountData, error: accountError } =
        await supabase
          .from("accounts")
          .select("*")
          .eq("id", userId)
          .single();
      if (accountError) {
        console.error("Error fetching account:", accountError);
        return res.status(500).json({ error: accountError.message });
      }

      // Retrieve opportunity data for the given opportunity
      const { data: opportunityData, error: oppError } =
        await supabase
          .from("opportunities")
          .select("*")
          .eq("id", opportunityId)
          .single();
      if (oppError) {
        console.error("Error fetching opportunity:", oppError);
        return res.status(500).json({ error: oppError.message });
      }

      // Extract necessary information for email notifications
      const studentName = accountData.name_and_surname;
      const studentEmail = accountData.email;
      const universityName = accountData.university_name || "N/A";
      const universityLocation =
        accountData.university_location || "N/A";
      const companyEmail = opportunityData.contactPersonEmail;
      const opportunityTitle = opportunityData.title;

      // Configure email options for the company employee
      const companyMailOptions = {
        from: "noreply.company.student.platform@gmail.com",
        to: companyEmail,
        subject: `New Application for ${opportunityTitle} through the Student Platform`,
        html: `<h1>New Application Received</h1>
      <h3>${studentName} has applied for <b>${opportunityTitle}</b> opportunity.</h3>
      <p><b>Applicant:</b> ${studentName} (${studentEmail})</p>
      <p><b>University:</b> ${universityName}, ${universityLocation}</p>
      <p><b>Note:</b> If provided, CV will be attached</p>`,
        attachments: file
          ? [{ path: file.path, filename: file.originalname }]
          : [],
      };

      // Configure email options for the student
      const studentMailOptions = {
        from: "noreply.company.student.platform@gmail.com",
        to: studentEmail,
        subject: `Application Confirmation for ${opportunityTitle}`,
        html: `<h1>Application Confirmation</h1>
      <h3>Thank you for applying for <b>${opportunityTitle} opportunity</b>.</h3>
      <p><b>Opportunity:</b> ${opportunityTitle}</p>
      <p><b>Contact Person Email:</b> ${companyEmail}</p>
      <p><b>Your Name:</b> ${studentName}</p>
      <p><b>Your Email:</b> ${studentEmail}</p>
      <p><b>University:</b> ${universityName}, ${universityLocation}</p>`,
        attachments: file
          ? [{ path: file.path, filename: file.originalname }]
          : [],
      };

      console.log("Sending emails...");
      await transporter.sendMail(companyMailOptions);
      await transporter.sendMail(studentMailOptions);

      // Cleanup: Delete the uploaded file if it exists
      if (file) {
        fs.unlink(file.path, (err) => {
          if (err) console.error("Failed to delete file:", err);
        });
      }

      res
        .status(201)
        .json({ status: "success", data: newApplication });
    } catch (error) {
      console.error("Error processing application:", error);
      res
        .status(500)
        .json({ error: "Error processing the application" });
    }
  }
);

// app.post("/smart-search", async (req, res) => {
//   try {
//     const { query } = req.body;

//     console.log(query);

//     if (!query)
//       return res.status(400).json({ error: "Query is required" });

//     // Read JSON data from files

//     const accounts = await readJSONFile(ACCOUNTS_FILE);

//     const opportunities = await readJSONFile(OPPORTUNITIES_FILE);

//     const applications = await readJSONFile(APPLICATIONS_FILE);

//     // Merge data into a human-readable prompt

//     const documents = applications.map((app) => {
//       const user =
//         accounts.find((acc) => acc.id === app.user_id) || {};

//       const opportunity =
//         opportunities.find((opp) => opp.id == app.opportunity_id) ||
//         {};

//       return `[ID: ${app.application_id}] Applicant "${user.name_and_surname}" from University "${user.university_name}" located at "${user.university_location}" applied for "${opportunity.title}" opportunity from "${opportunity.location}" on application date of "${app.application_date}".`;
//     });

//     const prompt = `Find the most relevant matches for this query: "${query}". Here are the applications:\n${documents.join(
//       "\n"
//     )}\n\nPlease return only the application IDs that match the query. Provide the IDs in the following format:\n\n"Matching IDs: [1, 2, 3]"`;

//     console.log(prompt);

//     // Send the prompt to the DeepSeek AI model

//     const response = await fetch(
//       "http://127.0.0.1:11434/api/generate",

//       {
//         method: "POST",

//         headers: {
//           "Content-Type": "application/json",
//         },

//         body: JSON.stringify({
//           model: "nezahatkorkmaz/deepseek-v3:latest",

//           prompt,

//           stream: false,
//         }),
//       }
//     );

//     if (!response.ok) {
//       throw new Error(`DeepSeek API error: ${response.statusText}`);
//     }

//     const responseData = await response.json();

//     const deepSeekResponse = responseData.response;

//     // Extract matching application IDs

//     const match = deepSeekResponse.match(/Matching IDs: \[(.*?)\]/);

//     const matchingIds = match
//       ? match[1].split(",").map((id) => id.trim())
//       : [];

//     // Filter applications based on IDs and enrich them with full data

//     const enrichedResults = applications

//       .filter((app) => matchingIds.includes(app.application_id))

//       .map((app) => {
//         const user =
//           accounts.find((acc) => acc.id === app.user_id) || {};

//         const opportunity =
//           opportunities.find((opp) => opp.id == app.opportunity_id) ||
//           {};

//         return {
//           application_id: app.application_id,

//           application_date: app.application_date,

//           applicant_name: user.name_and_surname,

//           applicant_email: user.email,

//           university_name: user.university_name,

//           university_location: user.university_location,

//           opportunity_title: opportunity.title,

//           opportunity_location: opportunity.location,
//         };
//       });

//     res.json(enrichedResults);
//   } catch (error) {
//     console.error("Error performing smart search:", error);

//     res.status(500).json({ error: "Failed to perform smart search" });
//   }
// });

app.post("/smart-search", async (req, res) => {
  try {
    const { query } = req.body;
    console.log("Search query:", query);
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    // Query Supabase for accounts, opportunities, and applications data
    const { data: accountsData, error: accountsError } =
      await supabase.from("accounts").select("*");
    if (accountsError) {
      console.error("Error fetching accounts:", accountsError);
      return res.status(500).json({ error: accountsError.message });
    }

    const { data: opportunitiesData, error: opportunitiesError } =
      await supabase.from("opportunities").select("*");
    if (opportunitiesError) {
      console.error(
        "Error fetching opportunities:",
        opportunitiesError
      );
      return res
        .status(500)
        .json({ error: opportunitiesError.message });
    }

    const { data: applicationsData, error: applicationsError } =
      await supabase.from("applications").select("*");
    if (applicationsError) {
      console.error(
        "Error fetching applications:",
        applicationsError
      );
      return res
        .status(500)
        .json({ error: applicationsError.message });
    }

    // Create a human-readable prompt by merging the data
    const documents = applicationsData.map((app) => {
      const user =
        accountsData.find((acc) => acc.id === app.user_id) || {};
      const opportunity =
        opportunitiesData.find(
          (opp) => opp.id == app.opportunity_id
        ) || {};
      return `[ID: ${app.application_id}] Applicant "${user.name_and_surname}" from University "${user.university_name}" located at "${user.university_location}" applied for "${opportunity.title}" opportunity from "${opportunity.location}" on application date of "${app.application_date}".`;
    });

    const prompt = `Find the most relevant matches for this query: "${query}". Here are the applications:\n${documents.join(
      "\n"
    )}\n\nPlease return only the application IDs that match the query. Provide the IDs in the following format:\n\n"Matching IDs: [1, 2, 3]"`;

    console.log("Generated prompt:", prompt);

    // Send the prompt to the DeepSeek AI model
    const deepSeekResponseRaw = await fetch(
      "http://127.0.0.1:11434/api/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nezahatkorkmaz/deepseek-v3:latest",
          prompt,
          stream: false,
        }),
      }
    );

    if (!deepSeekResponseRaw.ok) {
      throw new Error(
        `DeepSeek API error: ${deepSeekResponseRaw.statusText}`
      );
    }

    const deepSeekResponseData = await deepSeekResponseRaw.json();
    const deepSeekResponse = deepSeekResponseData.response;

    // Extract matching application IDs using regex
    const match = deepSeekResponse.match(/Matching IDs: \[(.*?)\]/);
    const matchingIds = match
      ? match[1].split(",").map((id) => id.trim())
      : [];

    // Filter and enrich the applications based on the matching IDs
    const enrichedResults = applicationsData
      .filter((app) => matchingIds.includes(app.application_id))
      .map((app) => {
        const user =
          accountsData.find((acc) => acc.id === app.user_id) || {};
        const opportunity =
          opportunitiesData.find(
            (opp) => opp.id == app.opportunity_id
          ) || {};
        return {
          application_id: app.application_id,
          application_date: app.application_date,
          applicant_name: user.name_and_surname,
          applicant_email: user.email,
          university_name: user.university_name,
          university_location: user.university_location,
          opportunity_title: opportunity.title,
          opportunity_location: opportunity.location,
        };
      });

    res.json(enrichedResults);
  } catch (error) {
    console.error("Error performing smart search:", error);
    res.status(500).json({ error: "Failed to perform smart search" });
  }
});

// GET endpoint to fetch all world universities
// app.get("/world-universities1", (req, res) => {
//   readFile(WU_FILE, "utf8", (err, data) => {
//     if (err) {
//       console.error("Error reading world universities file:", err);
//       return res
//         .status(500)
//         .json({ error: "Error reading data file" });
//     }
//     // Return the entire JSON file contents
//     res.json(JSON.parse(data));
//   });
// });
app.get("/world-universities", async (req, res) => {
  try {
    const limit = 1000;
    let offset = 0;
    let allData = [];
    let fetchMore = true;

    while (fetchMore) {
      // Fetch a batch of rows using the range method
      const { data, error } = await supabase
        .from("world-universities-and-domains")
        .select("*")
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching world universities:", error);
        return res.status(500).json({ error: error.message });
      }

      if (data.length === 0) {
        // No more rows returned, end the loop
        fetchMore = false;
      } else {
        // Append the current batch to our results array
        allData = allData.concat(data);
        // If we received less than the limit, there are no more rows
        if (data.length < limit) {
          fetchMore = false;
        } else {
          // Otherwise, update the offset for the next batch
          offset += limit;
        }
      }
    }

    // Process and parse each record as before
    const parsedData = allData.map((item) => {
      let parsedDomains = item.domains;
      if (typeof parsedDomains === "string") {
        try {
          parsedDomains = JSON.parse(parsedDomains);
        } catch (e) {
          console.error("Error parsing domains for item:", item, e);
          parsedDomains = [parsedDomains];
        }
      }

      let parsedWebPages = item.web_pages;
      if (typeof parsedWebPages === "string") {
        try {
          parsedWebPages = JSON.parse(parsedWebPages);
        } catch (e) {
          console.error("Error parsing web_pages for item:", item, e);
          parsedWebPages = [parsedWebPages];
        }
      }

      let parsedStateProvince = item["state-province"];
      if (
        typeof parsedStateProvince === "string" &&
        parsedStateProvince.trim() === ""
      ) {
        parsedStateProvince = null;
      }

      return {
        ...item,
        domains: parsedDomains,
        web_pages: parsedWebPages,
        "state-province": parsedStateProvince,
      };
    });

    res.json(parsedData);
  } catch (err) {
    console.error(
      "Unexpected error fetching world universities:",
      err
    );
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
