/*
 * Copyright (C) 2021 by Fonoster Inc (https://fonoster.com)
 * http://github.com/fonoster/fonos
 *
 * This file is part of Project Fonos
 *
 * Licensed under the MIT License (the "License");
 * you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *    https://opensource.org/licenses/MIT
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {ServerConfig} from "./types";
import VoiceResponse from "./voice";
import VoiceEvents from "./events";
import logger from "@fonos/logger";
import express from "express";
import fs from "fs";
const merge = require("deepmerge");
const app = express();
app.use(express.json());
require("express-ws")(app);

const voiceEvents = new VoiceEvents();
const defaultServerConfig: ServerConfig = {
  path: "/",
  port: 3000,
  bind: "0.0.0.0"
};

export default class VoiceServer {
  config: any;
  constructor(config: ServerConfig = defaultServerConfig) {
    this.config = merge(defaultServerConfig, config);
    this.init();
  }

  listen(handler: Function, port = this.config.port) {
    app.get("/tts/:file", function (req, res) {
      // TODO: Update to use a stream instead of fs.readFile
      fs.readFile("./.tts/" + req.params.file, function (err, data) {
        if (err) {
          res.send("unable to find or open file");
        } else {
          // TODO: Set this value according to file extension
          res.setHeader("content-type", "audio/x-wav");
          res.send(data);
        }
        res.end();
      });
    });

    app.post(this.config.path, async (req, res) => {
      const response = new VoiceResponse(req.body, voiceEvents);
      await handler(req.body, response);
      res.end();
    });
    logger.info(
      `starting voice server on @ ${this.config.bind}, port=${this.config.port}`
    );
    app.listen(port, this.config.bind);
  }

  init() {
    logger.info(`initializing voice server`);
    app.ws(this.config.path, (ws) => {
      ws.on("message", (msg) => {
        voiceEvents.broadcast(msg);
      });
    });
  }
}