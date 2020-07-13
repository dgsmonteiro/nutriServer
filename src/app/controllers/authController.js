const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mailer = require('../../modules/mailer')
const moment = require('moment');

const authConfig = require('../../config/auth')

const User = require('../models/user');
const Paciente = require('../models/paciente');
const Servico = require('../models/servico');
const Agenda = require('../models/agenda');
const Agendamento = require('../models/agendamento');

const router = express.Router();

function generateToken(params = {}) {
    
    return jwt.sign(params, authConfig.secret, { expiresIn: 50000});
}

router.post('/register', async(req, res) => {
    const {email} = req.body;
    
    try {
        if (await User.findOne({email}))
        return res.status(400).send({error: 'Usuario Ja existe'});

        req.body.accountType = 1;
        
        const user = await User.create(req.body);
        
        const userId = user._id;
        if (user.accountType === 1) {
            await Paciente.create({ userId });
        }
        user.password = undefined;
    

        return res.send({user, token: generateToken({id: user.id})});
    } catch (err) {
        res.status(400).send({ error: 'Falha no Registro', message: err});
    }
});

router.post('/autenticate', async(req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({email}).select('+password');

    if (!user)
        return res.status(400).send({error: 'Usuario não encontrado'});

    if (!await bcrypt.compare(password, user.password))
        return res.status(400).send({error: 'Usuário/Senha Inválido'});

    user.password = undefined;

    res.send({user, token: generateToken({id: user.id})});


});

router.post('/forgot_password', async (req, res) => {
    const {email} = req.body;

    try {
        const user = await User.findOne({email});

        if (!user)
            return res.status(400).send({error: 'Usuario não encontrado'});
        
        const token = crypto.randomBytes(20).toString('hex');

        const now = new Date();
        now.setHours(now.getHours()+1);

        await User.findByIdAndUpdate(user.id, {
            '$set': {
                passwordResetToken: token,
                passwordResetExpires: now
            }
        });

        mailer.sendMail({
            to: email,
            from: 'Tatiane Ribeiro Nutricionista',
            subject: 'RESET DE SENHA',
            template: 'auth/forgot_password',
            context: {token}
        }, (err) => {
            if(err)
                return res.status(400).send({error: 'Não consigo enviar email'});
            return res.send();
        })

    } catch (err) {
        req.status(400).send({error: 'Erro esqueci senha, tente novamente'})
    }
});

router.post('/reset_password', async(req, res) => {
    const {email, token, password} = req.body;

    try {
        const user = await User.findOne({email})
            .select('+passwordResetToken passwordResetExpires');

        if (!user)
            return res.status(400).send({error: 'Usuario não encontrado'});

        if(token !== user.passwordResetToken)
            return res.status(400).send({error: 'Token Invalido'});

        const now = Date();

        if (now > user.passwordResetExpires)
            return res.status(400).send({error: 'Token Expirado'});

        user.password = password;

        await user.save();

        res.send();
        
    } catch (err) {
        res.status(400).send({ error: 'Não posso resetar o usuário'})
    }
});

router.get('/listar_servicos', async(req, res) => {
    try {
       
        const servicos = await Servico.find();
        console.log(JSON.stringify(servicos));

        res.send({servicos: servicos});
        
            

        
    } catch (err) {
            res.status(400).send({ error: err});
    }
});
router.get('/listar_agendas', async(req, res) => {
    try {
        
        let agendas = await Agenda.find();
        let agendasSelecionadas = [];
        let servico = await Servico.findById(req.query.servicoId);
        for (let agenda of agendas) {
            if (agenda.servico.includes(servico.name)) {
                agenda.agendamentos = await Agendamento.find({agendaId: agenda.id});
                agendasSelecionadas.push(agenda);
            }
        }

        res.send({agendas: agendasSelecionadas});
        
            
           
        
    } catch (err) {
        res.status(400).send({ error: err});
    }
});
router.post('/horarios_disponiveis', async(req, res) => {
    try {
        

       let inicio = new Date (req.body.data);
       let fim = new Date (req.body.data);
       let agenda = await Agenda.findOne({ _id: req.body.agendaId });
       let servico = await Servico.findOne({ _id: req.body.servicoId});
       agenda.tempoAtendimento = servico.tempoAtendimento;
       inicio.setHours(parseInt(agenda.horaInicio.split(':')[0]), parseInt(agenda.horaInicio.split(':')[1]));
       fim.setHours(parseInt(agenda.horaFim.split(':')[0]), parseInt(agenda.horaFim.split(':')[1]));
       agenda.horarios = [];
        let agendamentos = await Agendamento.find({agendaId: req.body.agendaId, data: {$gte: inicio, $lte: fim}}).sort({data: 1});
        if (agendamentos.length < 1) {
            while (inicio < fim) {
                agenda.horarios.push(inicio);
                inicio = moment(inicio).add(agenda.tempoAtendimento + 10, 'm').toDate();
            }
        } else {
            while (inicio < fim) {
                let livre = true;
                let servicoAgendamento = {};
                for (const agendamento of agendamentos) {
                    servicoAgendamento = servico;
                    if (agendamento.servicoId !== req.body.servicoId) {
                        servicoAgendamento = await Servico.findOne({ _id: agendamento.servicoId });
                    }
                    const horarioFim = moment(inicio).add(parseInt(agenda.tempoAtendimento) + 10, 'm').toDate();
                    const agendamentoInicio = new Date(agendamento.data);
                    const agendamentoFim = moment(agendamentoInicio).add(parseInt(servicoAgendamento.tempoAtendimento) + 10, 'm').toDate();

                    if ((inicio < agendamentoFim ||
                        horarioFim < agendamentoInicio) &&
                        (agendamentoFim < inicio ||
                            agendamentoInicio < horarioFim)) {
                        livre = false;
                    }
                }
                if (livre) {
                    agenda.horarios.push(inicio);
                }
                inicio = moment(inicio).add(parseInt(agenda.tempoAtendimento) + 10, 'm').toDate();
            }
        }


        res.send({horarios: agenda.horarios, servico: servico});
        
            
           
        
    } catch (err) {
        res.status(400).send({ error: err});
    }
 });

module.exports = app => app.use('/auth', router);