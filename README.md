# 3-Tier-User-Platform-Project

## How the project works

The app has three parts:

```text
Browser frontend  →  Express API  →  MySQL database
```

1. **Frontend:** `client/public/index.html` displays the page, `style.css` styles it, and the behavior is built from `client/src/index.js` into `client/public/bundle.js`. On page load it requests `GET /api/users`. Submitting the form sends the user as JSON to `POST /api/users`; the trace panel shows the payload and reports success after the API confirms the insert. The page then reloads the user list.
2. **Backend:** `server/server.js` is the entry point run by `npm start`. It listens on port `5000`, serves the frontend, and handles the user API:

   | Method and path | Purpose |
   |---|---|
   | `GET /api/users` | Read all users |
   | `POST /api/users` | Insert a user |
   | `PUT /api/users/:id` | Update a user |
   | `DELETE /api/users/:id` | Delete a user |

3. **Database:** The backend uses `mysql2` to connect to `test_db`. On connection, it creates the `users` table if it does not exist. The table stores an auto-incrementing `id`, `name`, unique `email`, and `role` (`Admin` or `User`). The backend sends parameterized SQL to MySQL and returns the result to the frontend.

The current app runs `server/server.js` directly. The React files and the separate `server/app.js`/routes/controllers/models are alternate code paths and are not used by the current start command.

## Project structure

```text
.
├── client/
│   ├── public/
│   │   ├── index.html       # Served page and form
│   │   ├── style.css        # Page styles
│   │   └── bundle.js        # Browser code built by webpack
│   ├── src/
│   │   └── index.js         # Active browser request and rendering logic
│   ├── package.json
│   └── webpack.config.js
├── server/
│   ├── server.js            # Active Express server and API
│   ├── app.js               # Alternate Express app entry
│   ├── config/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   └── package.json
├── k8-manifests/
│   ├── qa/                  # Kubernetes QA deployment, service, ingress
│   └── prod/                # Kubernetes production resources
├── .github/workflows/
│   ├── qa-cicd.yml          # QA build, scans, and deployment workflow
│   └── prod-cd.yaml         # Production image promotion and deployment
├── Dockerfile               # Builds client assets and server image
└── docker-compose.yml       # Local app + MySQL stack
```

## Run locally

You need Node.js/npm and **one** MySQL option below. The local server uses these defaults:

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `3306` |
| Database | `test_db` |
| User | `appuser` |
| Password | `password123` |

### Option 1: MySQL installed in WSL Ubuntu

In WSL:

```bash
sudo apt update
sudo apt install -y mysql-server
sudo service mysql start
sudo service mysql status
sudo mysql
```

At the MySQL prompt, create the application database and user:

```sql
CREATE DATABASE IF NOT EXISTS test_db;
CREATE USER IF NOT EXISTS 'appuser'@'localhost' IDENTIFIED BY 'password123';
ALTER USER 'appuser'@'localhost' IDENTIFIED BY 'password123';
GRANT ALL PRIVILEGES ON test_db.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Then create table:

```sql
USE test_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role ENUM('Admin', 'User') NOT NULL
);
```

The server creates the `users` table automatically when it connects.

### Option 2: MySQL in Docker, app on your computer

Make sure Docker Desktop or Docker Engine is running. Use a Docker-managed volume for database files; do not bind-mount the database folder from `/mnt/e` or another Windows drive.

```bash
docker run -d --name project-mysql --restart unless-stopped \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=local-root-password \
  -e MYSQL_DATABASE=test_db \
  -e MYSQL_USER=appuser \
  -e MYSQL_PASSWORD=password123 \
  --mount type=volume,source=project-mysql-data,target=/var/lib/mysql \
  mysql:8.4
```

Wait until MySQL is ready:

```bash
docker logs -f project-mysql
```

When the log says `ready for connections`, press `Ctrl+C` to stop viewing logs (the container keeps running). If a local MySQL service is already using port `3306`, stop it before starting the container:

```bash
sudo service mysql stop
```

The named volume `project-mysql-data` preserves the database when the container stops. Stop and start the container with:

```bash
docker stop project-mysql
docker start project-mysql
```

### Run the application directly on your computer

To rebuild the frontend after changing its source, run from the project directory:

```bash
cd client
npm install
npm run build
```

It will create the bundle.js file in clint/public/bundle.js, this public folder is required to start the application

from the project directory:

```bash
cd server
npm install
npm start
```

Open [http://localhost:5000](http://localhost:5000). The server serves both the frontend and the API. Its first successful database connection creates the `users` table if needed.


### Build and run the app image separately

Use this with the standalone MySQL container from Option 2. Run from the project root:

```bash
docker build -t flowbase:v1 .
docker network create flowbase-net
docker network connect --alias mysql flowbase-net project-mysql
docker run -d --name flowbase --restart unless-stopped --network flowbase-net -p 5000:5000 -e DB_HOST=mysql -e DB_USER=appuser -e DB_PASSWORD=password123 -e DB_NAME=test_db -e PORT=5000 flowbase:v1
```

The shared Docker network lets the app resolve the database hostname `mysql`. Check the app with `docker logs -f flowbase`, then open [http://localhost:5000](http://localhost:5000).

### App and MySQL in Docker Compose

From the project root:

```bash
docker compose up --build -d
```

Open [http://localhost:5000](http://localhost:5000). The app container connects to the database using the Compose service name `mysql`; the database is published on host port `3307` for optional access from a database client. The app waits for MySQL's health check before starting.

Useful commands:

```bash
docker compose ps
docker compose logs -f app mysql
docker compose down
```

`docker compose down` keeps the database volume. To remove the database and all its data, run `docker compose down -v`.

Compose credentials default to the local-development values in the table above. You can override `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, or `MYSQL_HOST_PORT` in a root `.env` file.

### Remove Docker resources

For the standalone containers and image created above:

```bash
docker rm -f flowbase project-mysql
docker network rm flowbase-net
docker volume rm project-mysql-data
docker image rm flowbase:v1 mysql:8.4
```

For the Compose stack, from the project root:

```bash
docker compose down --rmi all --volumes --remove-orphans
```

These cleanup commands remove the database volume and its data. Run them only if you no longer need that data. They remove only the project resources listed here, not unrelated Docker resources.
