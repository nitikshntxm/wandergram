const express = require('express');
const path = require('path');
//const cookieParser = require('cookie-parser');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, set, get, update, push, remove, child } = require('firebase/database');
const { getStorage, ref: storageRef, uploadBytes, getDownloadURL, deleteObject } = require('firebase/storage'); // Correct import
const multerMemoryStorage = multer.memoryStorage();
const { format } = require('util'); // Import format from util module
const { promisify } = require('util'); // Import promisify from util module

const firebaseConfig = {
    apiKey: "AIzaSyBS_jL4Za7nZGA0nHI7-685mGJ4u3ky-0o",
    authDomain: "wandergram-f9bc0.firebaseapp.com",
    projectId: "wandergram-f9bc0",
    storageBucket: "wandergram-f9bc0.appspot.com",
    messagingSenderId: "143018933915",
    appId: "1:143018933915:web:290ac8a7c0dd78942f903e",
    measurementId: "G-BMX0S875WY"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);

// Initialize Google Cloud Storage
const storage = new Storage({
    projectId: firebaseConfig.projectId,
    keyFilename: './service-account-file.json' // Update this path
});
const bucket = storage.bucket(firebaseConfig.storageBucket);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets/images', express.static(path.join(__dirname, 'assets', 'images')));
app.use('/assets/js', express.static(path.join(__dirname, 'assets', 'js')));
app.use('/assets/fonts', express.static(path.join(__dirname, 'assets', 'fonts')));
app.use('/assets/css', express.static(path.join(__dirname, 'assets', 'css')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


// Multer configuration for handling file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // Limit file size to 5MB
    },
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'form-login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'form-login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'form-register.html'));
});

app.get('/feed', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'feed.html'));
});

app.get('/error', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'error.html'));
});

app.get('/userprofile', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'timeline.html'));
});

app.get('/myaccount', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'pages-setting.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'profile.html'));
});

app.get('/place', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'place.html'));
});

app.get('/places', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'place-info.html'));
});



// Register function
app.post('/register', async (req, res) => {
    const { email, password, firstName, lastName, username, gender, phone, terms } = req.body;

    try {
        // Create user in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid; // Get the UID of the newly created user

        // Save user details to Firebase Realtime Database
        const userData = {
            uid,
            email,
            firstName,
            lastName,
            username,
            gender,
            phone,
            terms
        };

        await set(ref(database, 'users/' + uid), userData); // Save user data under 'users' collection with UID

        console.log("User registered:", userCredential.user);
        res.status(201).send("User registered successfully");
    } catch (error) {
        console.error("Error registering user:", error);
        res.status(400).send("Error registering user");
    }
});

// Login function
app.post('/login', async (req, res) => {
    const { usernameOrEmail, password } = req.body;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, usernameOrEmail, password);
        console.log("User logged in:", userCredential.user);

        // Set a cookie with the user's UID for session management
        res.cookie('userUID', userCredential.user.uid, { httpOnly: true });

        res.status(200).send("User logged in successfully");
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(401).send("Invalid credentials");
    }
});

// Endpoint to get the current user's details
app.get('/user-details', async (req, res) => {
    const userUID = req.cookies.userUID;

    if (!userUID) {
        return res.status(401).send("Not authenticated");
    }

    try {
        const snapshot = await get(ref(database, 'users/' + userUID));
        if (snapshot.exists()) {
            res.status(200).json(snapshot.val());
        } else {
            res.status(404).send("User not found");
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).send("Internal server error");
    }
});



// Function to check if username exists
async function checkUsernameExists(username) {
    try {
        const snapshot = await get(ref(database, 'users'));
        if (snapshot.exists()) {
            const users = snapshot.val();
            for (let uid in users) {
                if (users[uid].username === username) {
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error("Error checking username:", error);
        throw error; // Throw the error for proper error handling
    }
}

// Endpoint to update user profile
app.post('/update-profile', upload.single('profileImage'), async (req, res) => {
    const userUID = req.cookies.userUID;

    if (!userUID) {
        return res.status(401).send("Not authenticated");
    }

    let updates = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        username: req.body.username,
        about: req.body.about,
        location: req.body.location,
        workingplace: req.body.workingplace,
        relationship: req.body.relationship,
    };

    // Remove empty fields
    Object.keys(updates).forEach(key => {
        if (!updates[key]) {
            delete updates[key];
        }
    });

    try {
        // Check if the new username already exists
        const usernameExists = await checkUsernameExists(updates.username);
        if (usernameExists) {
            console.error(`Username '${updates.username}' already exists.`);
            return res.status(400).send(`Username '${updates.username}' already exists.`);
        }

        if (req.file) {
            const imageBuffer = req.file.buffer;
            const imageFileName = `${userUID}_${req.file.originalname}`;
            const file = bucket.file(`profile-images/${imageFileName}`);

            // Upload file to Google Cloud Storage
            await file.save(imageBuffer, {
                metadata: {
                    contentType: req.file.mimetype
                }
            });

            // Get the download URL from Google Cloud Storage
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2491' // Update expiry date as needed
            });

            updates.profileImageUrl = url; // Add the signed URL to the updates object
        }

        // Update user details in Firebase Realtime Database
        const updatesRef = ref(database, 'users/' + userUID);
        await update(updatesRef, updates);

        console.log("User profile updated:", updates);
        res.status(200).send("Profile updated successfully");
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).send("Internal server error");
    }
});

async function uploadImageAndGetUrl(file, folderName) {
    // Remove spaces from original filename and generate a unique UUID
    const imageNameWithoutSpaces = file.originalname.replace(/\s+/g, '_');
    const imageFileName = `${uuidv4()}_${imageNameWithoutSpaces}`;
    const fileUpload = bucket.file(`${folderName}/${imageFileName}`);

    await new Promise((resolve, reject) => {
        const stream = fileUpload.createWriteStream({
            metadata: {
                contentType: file.mimetype,
            },
            resumable: false // Disable resumable uploads (optional)
        });

        stream.on('error', (err) => {
            console.error('Error uploading file:', err);
            reject(err);
        });

        stream.on('finish', () => {
            resolve();
        });

        stream.end(file.buffer);
    });

    const [url] = await fileUpload.getSignedUrl({
        action: 'read',
        expires: '03-09-2491' // Set expiration date as needed
    });

    const filename = imageFileName; // The filename with UUID
    return { filename, url };
}

// Endpoint to handle post creation with multiple images
app.post('/create-post', upload.array('postImages'), async (req, res) => {
    const userUID = req.cookies.userUID;

    if (!userUID) {
        return res.status(401).send('Not authenticated');
    }

    const { postText, destinationId } = req.body;
    const imageUrls = [];

    try {
        // Upload each image and get its download URL sequentially
        for (const file of req.files) {
            const { filename, url } = await uploadImageAndGetUrl(file, "post-images");
            imageUrls.push(filename + ",@," + url);
        }

        // Save post data to Firebase Realtime Database after all uploads are complete
        const postsRef = ref(database, `users/${userUID}/posts`);
        const newPostRef = push(postsRef);
        const postId = newPostRef.key;

        await set(newPostRef, {
            text: postText,
            destinationId: destinationId,
            imageUrls: imageUrls,
            date: new Date().toISOString(),
        });

        // Save the post ID in the destination's posts path
        await set(ref(database, `destinations/${destinationId}/posts/${postId}`), postId);


        res.status(201).send('Post created successfully');
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).send('Internal server error');
    }
});



// Endpoint to delete a specific post by ID
app.delete('/delete-post/:id', async (req, res) => {
    const postId = req.params.id;
    const destinationId = req.query.destinationId;
    const userUID = req.cookies.userUID;
    console.log(`Received request to delete post with ID: ${postId}`);

    try {
        // Fetch all posts from Realtime Database to get keys
        const postsRef = ref(database, `users/${userUID}/posts`);
        const postsSnapshot = await get(postsRef);

        if (!postsSnapshot.exists()) {
            return res.status(404).json({ success: false, message: 'No posts found' });
        }

        const posts = postsSnapshot.val();
        const postKeys = Object.keys(posts);
        console.log('Found post keys:', postKeys);

        // Find the post with the specified ID
        const postKey = postKeys.find(key => key === postId);

        if (!postKey) {
            console.log(`Post with ID: ${postId} not found`);
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        const postData = posts[postKey];
        const imageUrls = postData.imageUrls || [];

        // Check if imageUrls is an array and not empty
        if (Array.isArray(imageUrls) && imageUrls.length > 0) {
            // Delete images from storage
            const deletePromises = imageUrls.map(url => {
                if (typeof url !== 'string') {
                    console.log(`Skipping invalid URL: ${url}`);
                    return null;
                }
                try {
                    const parsedUrl = new URL(url);
                    const filePath = decodeURIComponent(parsedUrl.pathname); // Decoding URL path
                    console.log(`Deleting file at path: ${filePath}`);

                    // Reference the file in Google Cloud Storage bucket
                    const file = bucket.file(filePath.substring(1)); // Remove leading slash

                    return file.delete();
                } catch (error) {
                    console.error(`Error parsing URL or deleting file: ${url}`, error);
                    return null;
                }
            });

            await Promise.all(deletePromises.filter(p => p !== null)); // Filter out null promises

            // Delete post from Realtime Database
            await remove(ref(database, `users/${userUID}/posts/${postKey}`));
            // Remove the postId from the destination's posts path
            await remove(ref(database, `destinations/${destinationId}/posts/${postKey}`));
            console.log(`Post with ID: ${postId} deleted successfully`);
        } else {
            console.log('No image URLs found for deletion');
        }

        res.json({ success: true, message: 'Post deleted successfully' });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ success: false, message: 'An error occurred while deleting the post', error });
    }
});



// Endpoint to fetch posts for the logged-in user along with user details
app.get('/get-posts', async (req, res) => {
    const userUID = req.cookies.userUID;

    if (!userUID) {
        return res.status(401).send("Not authenticated");
    }

    try {
        // Fetch user details
        const userSnapshot = await get(ref(database, 'users/' + userUID));
        if (!userSnapshot.exists()) {
            return res.status(404).send("User not found");
        }

        const userDetails = userSnapshot.val();
        const { firstName, lastName, username, profileImageUrl } = userDetails;

        // Fetch user posts
        const postsSnapshot = await get(ref(database, `users/${userUID}/posts`));
        if (!postsSnapshot.exists()) {
            return res.status(404).send("No posts found");
        }

        const posts = postsSnapshot.val();

        // Convert posts to array and sort by timestamp (most recent first)
        const sortedPosts = Object.entries(posts)
            .map(([postId, post]) => ({ postId, ...post }))
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by timestamp

        // Append user details to each post
        const postsWithUserDetails = sortedPosts.map(post => ({
            ...post,
            user: {
                firstName,
                lastName,
                username,
                profileImageUrl
            }
        }));

        res.status(200).json(postsWithUserDetails);
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).send("Internal server error");
    }
});



// Middleware to log requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});





// Middleware to parse JSON bodies
app.use(express.json());



// Endpoint to add a comment to a specific post
app.post('/add-comment', async (req, res) => {
    const { postId, comment } = req.body;

    if (!postId || !comment) {
        return res.status(400).json({ success: false, message: 'Post ID and comment are required.' });
    }

    console.log(`Received request to add comment to post with ID: ${postId}`);

    try {
        // Fetch all posts from Realtime Database to get keys
        const db = getDatabase();
        const postsRef = ref(db, 'users');
        const postsSnapshot = await get(postsRef);

        if (!postsSnapshot.exists()) {
            return res.status(404).json({ success: false, message: 'No posts found' });
        }

        // Iterate over each user's posts to find the specific post
        let postKey = null;
        let userUID = null;

        postsSnapshot.forEach((userSnapshot) => {
            const userPosts = userSnapshot.child('posts').val();
            if (userPosts && Object.keys(userPosts).includes(postId)) {
                postKey = postId;
                userUID = userSnapshot.key;
            }
        });

        if (!postKey) {
            console.log(`Post with ID: ${postId} not found`);
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        const postRef = ref(db, `users/${userUID}/posts/${postKey}`);
        const postDataSnapshot = await get(postRef);

        if (!postDataSnapshot.exists()) {
            console.log(`Post with ID: ${postId} not found`);
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        const postData = postDataSnapshot.val();
        const comments = postData.comments || [];

        // Add the new comment to the comments array
        comments.push({ text: comment, timestamp: Date.now() });

        // Update the post with the new comments array
        await update(postRef, { comments });

        console.log(`Comment added to post with ID: ${postId}`);
        res.json({ success: true, message: 'Comment added successfully.' });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ success: false, message: 'An error occurred while adding the comment.', error });
    }
});



// Route to handle fetching total comments and comments list for a post
app.post('/total-comments', async (req, res) => {
    try {
        const { postId } = req.body;

        if (!postId) {
            return res.status(400).json({ success: false, message: 'Post ID is required.' });
        }

        // Reference to find the specific post by iterating over users
        const usersRef = ref(database, 'users');
        const usersSnapshot = await get(usersRef);

        if (!usersSnapshot.exists()) {
            return res.status(404).json({ success: false, message: 'No users found.' });
        }

        let foundPost = null;
        let userUID = null;

        // Iterate over each user to find the post
        usersSnapshot.forEach(userSnapshot => {
            const posts = userSnapshot.child('posts').val();
            if (posts && Object.keys(posts).includes(postId)) {
                foundPost = posts[postId];
                userUID = userSnapshot.key;
            }
        });

        if (!foundPost) {
            return res.status(404).json({ success: false, message: 'Post not found.' });
        }

        // Reference to the comments for the specific post
        const commentsRef = ref(database, `users/${userUID}/posts/${postId}/comments`);

        // Fetch the snapshot of the comments
        const snapshot = await get(commentsRef);

        // If no comments are found, return an empty array
        if (!snapshot.exists()) {
            return res.json({ success: true, totalComments: 0, comments: [] });
        }

        // Array to hold comments
        let comments = [];

        // Iterate over each child and store in the comments array
        snapshot.forEach((childSnapshot) => {
            const comment = childSnapshot.val();
            comments.push(comment);
        });

        // Calculate total number of comments
        const totalComments = comments.length;

        res.json({ success: true, totalComments, comments });
    } catch (error) {
        console.error('Error fetching total comments:', error);
        res.status(500).json({ success: false, message: 'Error fetching total comments', error });
    }
});



app.post('/add-destination', upload.array('images'), async (req, res) => {
    const {
        destinationName, description, shortdescription, category, temperature, rating, nearestCity, state, country
    } = req.body;

    if (!destinationName || !description || !shortdescription || !category || !temperature || !rating || !nearestCity || !state || !country) {
        console.error('Validation failed:', req.body); // Add this line to debug
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    try {
        const destImageUrls = [];
        if (req.files) {
            for (const file of req.files) {
                const { filename, url } = await uploadImageAndGetUrl(file, "places");
                destImageUrls.push(filename + ",@," + url);
            }
        }

        const destinationId = uuidv4();
        const destinationData = {
            destinationName,
            shortdescription,
            description,
            category,
            temperature,
            rating,
            nearestCity,
            state,
            country,
            destImageUrls,
        };

        await set(ref(database, `destinations/${destinationId}`), destinationData);

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error adding destination:', error); // Add this line to debug
        res.status(500).json({ success: false, message: 'Failed to add destination.' });
    }
});


app.get('/get-destinations', async (req, res) => {
    try {
        const destinationsSnapshot = await get(ref(database, 'destinations'));
        if (!destinationsSnapshot.exists()) {
            return res.status(404).send("No destinations found");
        }

        const destinations = destinationsSnapshot.val();
        // Create an array of destinations, including their IDs
        const destinationsArray = Object.entries(destinations).map(([destinationId, destinationData]) => ({
            ...destinationData,
            destinationId
        }));

        res.status(200).json(destinationsArray);
    } catch (error) {
        console.error('Error fetching destinations:', error);
        res.status(500).send("Internal server error");
    }
});

// Endpoint to fetch destination details by ID
app.get('/get-single-destination', async (req, res) => {
    const destinationId = req.query.id;

    try {
        const destinationSnapshot = await get(child(ref(database), `destinations/${destinationId}`));
        if (!destinationSnapshot.exists()) {
            return res.status(404).json({ error: 'Destination not found' });
        }

        const destinationData = destinationSnapshot.val();
        res.status(200).json(destinationData);
    } catch (error) {
        console.error('Error fetching destination:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Endpoint to fetch post details by post ID
app.get('/get-post-details', async (req, res) => {
    const postId = req.query.id;

    try {
        // Find the user that owns the post
        let userRef;
        let userData;

        // Loop through users to find the post
        const usersSnapshot = await get(ref(database, 'users'));
        usersSnapshot.forEach((user) => {
            const postsSnapshot = user.child('posts');
            postsSnapshot.forEach((post) => {
                if (post.key === postId) {
                    userRef = user.ref;
                    userData = user.val();
                }
            });
        });

        // If user found, return data
        if (userData) {
            const profileImageUrl = userData.profileImageUrl;
            const firstName = userData.firstName;
            const lastName = userData.lastName;

            const postDetails = userData.posts[postId]; // Assuming 'posts' is a sub-node of user data

            res.json({
                postDetails: postDetails,
                profileImageUrl: profileImageUrl,
                firstName: firstName,
                lastName: lastName
            });
        } else {
            res.status(404).json({ error: 'Post not found' });
        }
    } catch (error) {
        console.error('Error fetching post details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Endpoint to add a like to a specific post
app.post('/add-like', async (req, res) => {
    try {
        const { postId } = req.body;
        const userUID = req.cookies.userUID;

        if (!postId) {
            return res.status(400).json({ success: false, message: 'Post ID is required.' });
        }

        // Reference to the specific post
        const db = getDatabase();
        const usersRef = ref(db, 'users');

        let responseSent = false;

        // Fetch all users
        const usersSnapshot = await get(usersRef);

        usersSnapshot.forEach((userSnapshot) => {
            if (responseSent) return;

            const userUID = userSnapshot.key;
            const userPosts = userSnapshot.child('posts').val();

            if (userPosts && userPosts[postId]) {
                const postDetails = userPosts[postId];
                const currentLikes = postDetails.likes || 0;
                let likedAccounts = postDetails.likedAccounts || [];

                // Ensure likedAccounts is an array
                if (!Array.isArray(likedAccounts)) {
                    likedAccounts = [];
                }

                if (likedAccounts.includes(userUID)) {
                    res.status(400).json({ success: false, message: 'You have already liked this post.' });
                    responseSent = true;
                    return;
                }

                likedAccounts.push(userUID);

                // Update likes and likedAccounts
                update(ref(db, `users/${userUID}/posts/${postId}`), {
                    likes: currentLikes + 1,
                    likedAccounts: likedAccounts
                });

                responseSent = true;
                res.json({ success: true, message: 'Like added successfully.' });
            }
        });

        if (!responseSent) {
            res.status(404).json({ success: false, message: 'Post not found.' });
        }
    } catch (error) {
        console.error('Error adding like:', error);
        res.status(500).json({ success: false, message: 'An error occurred while adding like.', error });
    }
});

app.post('/addCommentDest', async (req, res) => {
    const { destinationId, comment, timestamp } = req.body;

    if (!destinationId || !comment || !timestamp) {
        return res.status(400).send('Missing parameters');
    }

    try {
        const commentsRef = ref(database, `destinations/${destinationId}/comments`);
        await push(commentsRef, { comment, timestamp });
        res.status(200).send('Comment added successfully');
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/search', async (req, res) => {
    const { searchText } = req.body;

    if (!searchText || searchText.length < 2) {
        return res.status(400).send('Minimum 2 characters required');
    }

    try {
        const destinationsSnapshot = await get(ref(database, 'destinations'));
        const usersSnapshot = await get(ref(database, 'users'));

        let results = [];

        // Search in destinations
        if (destinationsSnapshot.exists()) {
            destinationsSnapshot.forEach(destination => {
                const destinationId = destination.key;
                const destinationData = destination.val();
                if (destinationData.destinationName.toLowerCase().includes(searchText.toLowerCase())) {
                    results.push({
                        type: 'destination',
                        data: {
                            destinationId,
                            ...destinationData
                        }
                    });
                }
            });
        }

        // Search in users' usernames
        if (usersSnapshot.exists()) {
            usersSnapshot.forEach(user => {
                const userId = user.key;
                const userData = user.val();
                const username = userData.username || '';
                const profileImageUrl = userData.profileImageUrl || '';

                if (username.toLowerCase().includes(searchText.toLowerCase())) {
                    results.push({
                        type: 'user',
                        data: {
                            userId,
                            username,
                            profileImageUrl
                        }
                    });
                }
            });
        }

        res.json(results);
    } catch (error) {
        console.error('Error fetching search results:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.post('/bestmoments', async (req, res) => {
    try {
        const usersSnapshot = await get(ref(database, 'users'));

        let bestMoments = [];

        if (usersSnapshot.exists()) {
            usersSnapshot.forEach(user => {
                const userId = user.key;
                const userData = user.val();
                const username = userData.username || '';
                const profileImageUrl = userData.profileImageUrl || '';

                // Find the most liked post
                let mostLikedPost = null;
                let maxLikes = 0;

                const userPosts = userData.posts || {};
                Object.keys(userPosts).forEach(postId => {
                    const post = userPosts[postId];
                    const likes = post.likes || 0;

                    if (likes > maxLikes) {
                        mostLikedPost = {
                            postId,
                            ...post
                        };
                        maxLikes = likes;
                    }
                });

                // Add to bestMoments if the post has more than 100 likes
                if (mostLikedPost && mostLikedPost.likes > 100) {
                    bestMoments.push({
                        userId,
                        username,
                        profileImageUrl,
                        mostLikedPost
                    });
                }
            });
        }

        // Send the best moments array to the client
        res.json(bestMoments);
    } catch (error) {
        console.error('Error fetching best moments:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Endpoint to fetch posts for all users along with user details
app.get('/get-feed', async (req, res) => {
    try {
        // Fetch all users
        const usersSnapshot = await get(ref(database, 'users'));
        if (!usersSnapshot.exists()) {
            return res.status(404).send("No users found");
        }

        const users = usersSnapshot.val();
        let allPosts = [];

        // Iterate over each user
        for (const userUID in users) {
            const userDetails = users[userUID];
            const { firstName, lastName, username, profileImageUrl } = userDetails;

            // Fetch user posts
            const postsSnapshot = await get(ref(database, `users/${userUID}/posts`));
            if (postsSnapshot.exists()) {
                const posts = postsSnapshot.val();

                // Convert posts to array and sort by timestamp (most recent first)
                const sortedPosts = Object.entries(posts)
                    .map(([postId, post]) => ({ postId, ...post }))
                    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by timestamp

                // Append user details to each post
                const postsWithUserDetails = sortedPosts.map(post => ({
                    ...post,
                    user: {
                        firstName,
                        lastName,
                        username,
                        profileImageUrl
                    }
                }));

                allPosts = allPosts.concat(postsWithUserDetails);
            }
        }

        res.status(200).json(allPosts);
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).send("Internal server error");
    }
});



const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // This will listen on all network interfaces

app.listen(PORT, HOST, () => {
    console.log(`Server is running at http://${HOST}:${PORT}`);
});
