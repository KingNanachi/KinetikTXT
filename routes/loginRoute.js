// Notes
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise

// Express Variables
const express = require("express")
const expressValidator = require ("express-validator")
const {databasePool, isAuthenticated} = require("../index.js")
const router = express.Router()


// Password Hashing Variables
const bcrypt = require('bcrypt');
const saltRounds = 10;

// Validation
// It's written out here for the sake of keeping things clean
const validateRegisterForm = 
[
    expressValidator.body('registerUsername').isLength({ min: 2,}).withMessage("Username must be at least 2 characters long"),
    expressValidator.body('registerEmail').isEmail().withMessage("Invalid Email"),
    expressValidator.body('registerPassword').isLength({ min: 8 }).withMessage("Password must be at least 8 characters long"),
]

const validateLoginForm = 
[
    expressValidator.body('loginEmail').isEmail().withMessage("Invalid Email"),
]

// Functions
async function createUser(registerFormData) 
{
    const promise = new Promise((resolve, reject) =>
    {
        // Connect to the pool
        databasePool.getConnection((error, connection) => 
        {
            if (error) 
            {
                reject(error)
                return
            }
        
            const query = "CALL CreateUser(?, ?, ?)"
            const values = [registerFormData.username, registerFormData.email, registerFormData.hashedPassword]

            connection.query(query, values, (error, results) => 
            {
                connection.release()

                if (error) 
                {
                    reject(error)
                } 
                else 
                {
                    const result = results[0][0]
                    /*  result is an object
                        {
                            message: null or String,
                            success: true or false
                        }
                    */
                    resolve(result)
                }
            })
        })
    })
    return promise
}

async function getUserByEmail(email)
{
    const promise = new Promise((resolve, reject) =>
    {
        // Connect to the pool
        databasePool.getConnection((error, connection) => 
        {
            if (error) 
            {
                reject(error)
                return
            }
    
        const query = "CALL GetUserByEmail(?)"
        const values = [email]
  
        connection.query(query, values, (error, results) => 
        {
            connection.release()

            if (error) 
            {
                reject(error)
            } 
            else 
            {
                const result = results[0]
                /*  result is an object
                    {
                        username: String,
                        email: String,
                        password: Hash (String),
                        score: int,
                    }
                */
                resolve(result)
            }
        })
      })
    })
    return promise
  }


function prepareObjectForURL(Object)
{
    const urlString = encodeURIComponent(JSON.stringify(Object))
    return urlString
}

function isNotAuthenticated(req, res, next)
{
    if (req.session.userID)
    {
        res.redirect("/profile")
    }
    else
    {
        next()
    }
}

router.get("/login", isNotAuthenticated, (req, res) => 
{
    const showHeader = true
    const showProfile = false
    const dynamicContent = 
    `
        <div class="content-title">
            <h1>L O G  <span class="kinetik-blue">I N</span></h1>
            <p class="italic">and get typing...</p>
        </div>

        <div class = "generic-container">
            <div class = "generic-content50">
                <form class="account-form" id="loginForm" action="/login" method="post">
                    Enter your login details
                    <br>
                    <br>
                    Email
                    <input class="generic-input-bordered" type="email" id="loginEmail" name="loginEmail" required>
                    <br>
                    Password
                    <input class="generic-input-bordered" type="password" id="loginPassword" name="loginPassword" required>
                    <br>
                    <button class="account-input-button" type="submit">Log In</button>
                </form>
            </div>

            <div class = "generic-content50">
                <form class="account-form" id="registerForm" action="/register" method="post">
                    Or register a new account
                    <br>
                    <br>
                    Username
                    <input class="generic-input-bordered" type="text" id="registerUsername" name="registerUsername" required>
                    <br>
                    Email
                    <input class="generic-input-bordered" type="email" id="registerEmail" name="registerEmail" required>
                    <br>
                    Password
                    <input class="generic-input-bordered" type="password" id="registerPassword" name="registerPassword" required>
                    <br>
                    <button class="account-input-button" type="submit">Register Account</button>
                </form>
            </div>
        </div>
    `

    res.render("base", { body: dynamicContent, showHeader, showProfile})
})

router.post("/login", validateLoginForm, async (req, res) => 
{
    console.log("Login Details Submitted")

    // Store Login Form Data + Sanitise
    const loginFormData =
    {
        email: req.sanitize(req.body.loginEmail),
        password: req.sanitize(req.body.loginPassword),
    }

    // Validate the Login Form Data
    const errors = expressValidator.validationResult(req)

    // Extract error messages by going through each error object
    // Then store as an array
    const errorArray = errors.array()
    const errorMessageArray = errorArray.map(error => error.msg)

    // Package the error info and form data for the Client to process
    const errorObject =
    {
        loginMessages: errorMessageArray,
        loginData: loginFormData,
    }

    // Authenticate the Data
    try
    {
        // Check if there is any user with a matching email
        const user = await getUserByEmail(loginFormData.email)

        if (!user || user.length === 0)
        {
            // User doesn't exist
            errorMessageArray.push("Invalid email, password or both")
        }
        else
        {
            // Now check if the password matches
            const passwordCorrect = await bcrypt.compare(loginFormData.password, user[0].password)
            if (!passwordCorrect)
            {
                // This password doesn't match for this user
                // But don't give any information regarding that
                errorMessageArray.push("Invalid email, password or both")
            }
        }

        if (errorObject.loginMessages.length > 0)
        {
            // This means there were errors
            // Redirect the user back to the login page with the error information
            return res.redirect(`/login?error=login&info=${prepareObjectForURL(errorObject)}`)
        }

        // Redirect to the home page
        console.log(`Logging In: [${user[0].user_id}] ${user[0].username}`)
        req.session.user_id = user[0].user_id
        req.session.username = user[0].username
        req.session.email = user[0].email
        res.redirect("/")
    }
    catch (error)
    {
        // Something went wrong somewhere
        console.log("An error occurred:", error.message)
        errorMessageArray.push(error.message)

        // Redirect the user back to the login page with the error information
        return res.redirect(`/login?error=login&info=${prepareObjectForURL(errorObject)}`)
    }
})

router.post("/register", validateRegisterForm, async (req, res) => 
{
    console.log("Registration Details Submitted")

    // Store Register Form Data + Sanitise
    const registerFormData =
    {
        username: req.sanitize(req.body.registerUsername),
        email: req.sanitize(req.body.registerEmail),
        password: req.sanitize(req.body.registerPassword),
        hashedPassword: null,
    }

    // Validate the Register Form Data
    const errors = expressValidator.validationResult(req)

    // Extract error messages by going through each error object
    // Then store as an array
    const errorArray = errors.array()
    const errorMessageArray = errorArray.map(error => error.msg)

    // Package the error info and form data for the Client to process
    const errorObject =
    {
        registerMessages: errorMessageArray,
        registerData: registerFormData,
    }

    try
    {
        // Check if the username contains only valid characters via a regex
        if (!/^[a-zA-Z0-9_-]+$/.test(registerFormData.username)) 
        {
            // If not add this to the error message array
            errorMessageArray.push("Username can only contain letters, numbers, -, and _.")
        }
    
        if (errorObject.registerMessages.length > 0)
        {
            // This means there were errors
            // Remove sensitive data
            delete registerFormData.password
            delete registerFormData.hashedPassword
    
            // Redirect the user back to the login page with the error information
            return res.redirect(`/login?error=register&info=${prepareObjectForURL(errorObject)}`)
        }
    
        // Hash the password
        const hashedPassword = bcrypt.hashSync(registerFormData.password, saltRounds)
        registerFormData.hashedPassword = hashedPassword
    
        // Then store in database
        // "await" is used because it takes time to process queries
        const registerResults = await createUser(registerFormData)

        if (registerResults.success)
        {
            // A new user was created!
            console.log("New user added to KinetikTXT database!")
        }
        else
        {
            errorMessageArray.push(registerResults.message)
            return res.redirect(`/login?error=register&info=${prepareObjectForURL(errorObject)}`)
        }
    
        // Redirect to the home page
        res.redirect("/")
    }
    catch (error)
    {
        // Something went wrong somewhere
        console.log("An error occurred:", error.message)
        errorMessageArray.push(error.message)

        // Redirect the user back to the login page with the error information
        return res.redirect(`/login?error=register&info=${prepareObjectForURL(errorObject)}`)
    }
})

module.exports = router